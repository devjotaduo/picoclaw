package api

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// maxWorkspaceUploadBytes caps the size of an uploaded workspace archive.
// 50 MiB is generous for a workspace with images / skill scripts / a few
// hundred KB of memory files — anything beyond is almost certainly an
// operator dragging the wrong folder.
const maxWorkspaceUploadBytes = 50 << 20 // 50 MiB

// maxWorkspaceExtractedBytes caps the total UNCOMPRESSED size. Defends
// against zip bombs (a 50 MiB zip can decompress to >1 GiB).
const maxWorkspaceExtractedBytes = 200 << 20 // 200 MiB

// maxWorkspaceExtractedFiles caps the per-archive file count for the same
// reason — a malicious zip could have a million empty entries.
const maxWorkspaceExtractedFiles = 5000

// handleUploadWorkspace receives a multipart/form-data POST with a zip
// archive containing the workspace's home/ subtree and creates a new
// Workspace row + on-disk directory from it. The form fields:
//
//	name           string  (required)
//	slug           string  (optional — derived from name if empty)
//	description    string  (optional)
//	is_default_auto string ("true"/"false", optional, default false)
//	is_available_manual string ("true"/"false", optional, default true)
//	archive        file    (required) — .zip containing a single top-level
//	                                    "home/" or the workspace files
//	                                    directly at root
//
// The zip's content is validated against the path-traversal /
// hidden-files / size rules before anything lands on disk. Partial
// failures clean up the destination directory so the operator can retry.
func (h *Handler) handleUploadWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxWorkspaceUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "parse upload: "+err.Error())
		return
	}

	name := strings.TrimSpace(r.FormValue("name"))
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	slug := normalizeSlug(r.FormValue("slug"))
	if slug == "" {
		slug = normalizeSlug(name)
	}
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required (or pass a name that normalizes to a slug)")
		return
	}
	description := strings.TrimSpace(r.FormValue("description"))
	isDefaultAuto := r.FormValue("is_default_auto") == "true"
	isAvailableManual := r.FormValue("is_available_manual") != "false" // default true
	isRaw := r.FormValue("is_raw") == "true"                            // default false — opt in

	file, fileHeader, err := r.FormFile("archive")
	if err != nil {
		writeError(w, http.StatusBadRequest, "archive file is required (field name: archive)")
		return
	}
	defer file.Close()

	if fileHeader.Size > maxWorkspaceUploadBytes {
		writeError(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("archive is %d bytes; cap is %d", fileHeader.Size, maxWorkspaceUploadBytes))
		return
	}

	// Buffer the upload so we can pass a ReaderAt to zip.NewReader.
	archiveBytes, err := io.ReadAll(io.LimitReader(file, maxWorkspaceUploadBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "read upload: "+err.Error())
		return
	}
	if int64(len(archiveBytes)) > maxWorkspaceUploadBytes {
		writeError(w, http.StatusRequestEntityTooLarge,
			"archive exceeds the maximum upload size")
		return
	}

	zipReader, err := zip.NewReader(bytes.NewReader(archiveBytes), int64(len(archiveBytes)))
	if err != nil {
		writeError(w, http.StatusBadRequest, "archive is not a valid zip: "+err.Error())
		return
	}

	// Pre-validate the entire archive BEFORE writing anything to disk. This
	// is the only chance to reject a malicious zip without leaving partial
	// state in the workspace dir. Raw uploads use a much smaller drop list
	// so the operator can carry sessions/, launcher-auth.db, etc. through.
	if err := validateWorkspaceZip(zipReader, isRaw); err != nil {
		writeError(w, http.StatusBadRequest, "archive validation: "+err.Error())
		return
	}

	hostPath := filepath.Join(h.Cfg.WorkspaceDir, slug)
	homeDir := filepath.Join(hostPath, tenant.WorkspaceHomeSubdir)

	// Reject if the slug is already in use on disk — overwriting an existing
	// workspace via upload would be a foot-gun.
	if _, err := os.Stat(hostPath); err == nil {
		writeError(w, http.StatusConflict, "a workspace already exists at "+hostPath+"; pick a different slug or delete it first")
		return
	}

	// Create the three subdirs (matching handleCreateWorkspace's shape).
	for _, sub := range []string{
		tenant.WorkspaceHomeSubdir,
		tenant.WorkspaceFrontendSrcSubdir,
		tenant.WorkspaceFrontendDistSubdir,
	} {
		if err := os.MkdirAll(filepath.Join(hostPath, sub), 0o755); err != nil {
			writeError(w, http.StatusInternalServerError, "mkdir "+sub+": "+err.Error())
			return
		}
	}

	// Extract into home/. The cleanup path removes the entire workspace dir
	// on extraction failure so the operator doesn't see a half-written tree.
	cleanup := func() { _ = os.RemoveAll(hostPath) }
	if err := extractWorkspaceZip(zipReader, homeDir, isRaw); err != nil {
		cleanup()
		writeError(w, http.StatusInternalServerError, "extract: "+err.Error())
		return
	}

	rolePolicyJSON, err := store.MarshalRolePolicy(policy.DefaultRolePolicy())
	if err != nil {
		cleanup()
		writeError(w, http.StatusInternalServerError, "role policy: "+err.Error())
		return
	}
	ws := &store.Workspace{
		ID:                slug + "-" + randomHex(3),
		Name:              name,
		Slug:              slug,
		Description:       description,
		HostPath:          hostPath,
		IsDefaultAuto:     isDefaultAuto,
		IsAvailableManual: isAvailableManual,
		IsRaw:             isRaw,
		RolePolicyJSON:    rolePolicyJSON,
	}
	if err := h.Workspaces.Insert(r.Context(), ws); err != nil {
		cleanup()
		writeError(w, http.StatusInternalServerError, "insert workspace: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, summarizeWorkspace(ws))
}

// validateWorkspaceZip walks the archive and rejects MALICIOUS inputs only:
//   - paths with .. or absolute paths (path traversal)
//   - paths outside the expected "home/" prefix when used
//   - symlinks / device files (non-regular)
//   - more than maxWorkspaceExtractedFiles entries
//   - more than maxWorkspaceExtractedBytes total uncompressed
//
// Runtime-only entries (sessions/, whatsapp/, state/, *.pid, dashboardauth.db,
// etc.) are NOT rejected — they're silently skipped at extraction time. This
// lets operators zip an entire running tenant's volume without curating it
// first; the validator only complains about things that look like an attack.
// The skip list mirrors shouldHideTenantPath so what gets dropped here is
// exactly what would be hidden from the tenant file editor anyway.
//
// When isRaw is true, only truly-junk runtime files (.picoclaw.pid,
// node_modules, .git, .cache, backups) are dropped. Everything else —
// including launcher-auth.db, sessions/, launcher_policy.json — passes
// through verbatim so the operator owns the full boot state.
func validateWorkspaceZip(zr *zip.Reader, isRaw bool) error {
	if len(zr.File) > maxWorkspaceExtractedFiles {
		return fmt.Errorf("archive has %d files; cap is %d", len(zr.File), maxWorkspaceExtractedFiles)
	}

	dropFn := shouldHideTenantPath
	if isRaw {
		dropFn = shouldDropOnRawUpload
	}

	var total int64
	stripHome := allEntriesShareHomePrefix(zr)
	for _, f := range zr.File {
		rel := filepath.ToSlash(f.Name)
		if stripHome {
			rel = strings.TrimPrefix(rel, "home/")
		}
		if rel == "" {
			continue
		}
		if strings.HasPrefix(rel, "/") || strings.Contains(rel, "\\") {
			return fmt.Errorf("entry %q uses absolute or backslash path", f.Name)
		}
		cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(rel)))
		if cleaned == ".." || strings.HasPrefix(cleaned, "../") || strings.Contains(cleaned, "/../") {
			return fmt.Errorf("entry %q escapes the workspace root", f.Name)
		}
		if !f.FileInfo().Mode().IsRegular() && !f.FileInfo().IsDir() {
			return fmt.Errorf("entry %q is not a regular file or directory (no symlinks / device files)", f.Name)
		}
		// Runtime files don't count toward the byte cap — they'll be skipped
		// on extract. Only "real" workspace content contributes to total.
		if dropFn(cleaned, f.FileInfo().IsDir()) {
			continue
		}
		total += int64(f.UncompressedSize64)
		if total > maxWorkspaceExtractedBytes {
			return fmt.Errorf("archive expands beyond the %d byte cap (zip bomb?)", maxWorkspaceExtractedBytes)
		}
	}
	return nil
}

// allEntriesShareHomePrefix returns true when every non-empty entry in the
// archive starts with "home/". That lets us accept BOTH:
//
//	(a) archive structured as home/config.json, home/workspace/AGENT.md ...
//	    → strip the "home/" prefix on extract so it lands at <ws>/home/...
//
//	(b) archive structured as config.json, workspace/AGENT.md ...
//	    → no strip, lands at <ws>/home/...
//
// Operators tend to zip either shape; this avoids forcing them to know
// which one the server wants.
func allEntriesShareHomePrefix(zr *zip.Reader) bool {
	any := false
	for _, f := range zr.File {
		name := filepath.ToSlash(f.Name)
		if name == "" {
			continue
		}
		if !strings.HasPrefix(name, "home/") && name != "home" {
			return false
		}
		any = true
	}
	return any
}

// extractWorkspaceZip writes the archive contents into dst. Assumes
// validateWorkspaceZip already passed (this function does NOT re-check
// for malicious paths beyond a final containment assert).
//
// Runtime-only entries (sessions/, whatsapp/, state/, *.pid, etc.) are
// silently skipped — they're either re-created by the launcher on first
// boot or owned exclusively by the provisioner. Lets operators upload a
// zip of a live tenant volume without curating it.
//
// When isRaw is true, the drop list shrinks to just .picoclaw.pid +
// node_modules/.git/.cache/backups so the rest of the volume (including
// launcher-auth.db, sessions/, launcher_policy.json) carries through.
func extractWorkspaceZip(zr *zip.Reader, dst string, isRaw bool) error {
	dropFn := shouldHideTenantPath
	if isRaw {
		dropFn = shouldDropOnRawUpload
	}
	stripHome := allEntriesShareHomePrefix(zr)
	dstAbs, err := filepath.Abs(dst)
	if err != nil {
		return err
	}
	for _, f := range zr.File {
		rel := filepath.ToSlash(f.Name)
		if stripHome {
			rel = strings.TrimPrefix(rel, "home/")
		}
		if rel == "" {
			continue
		}
		cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(rel)))
		// Skip runtime-only entries silently. shouldHideTenantPath is the
		// same predicate the file editor uses to hide these from the admin,
		// so what gets dropped here is consistent with the rest of the UI.
		if dropFn(cleaned, f.FileInfo().IsDir()) {
			continue
		}
		target := filepath.Join(dst, filepath.FromSlash(rel))
		// Final containment: even after validation, double-check abs path
		// stays inside dst. Belt-and-braces against path-encoding tricks.
		targetAbs, err := filepath.Abs(target)
		if err != nil {
			return err
		}
		if targetAbs != dstAbs && !strings.HasPrefix(targetAbs, dstAbs+string(filepath.Separator)) {
			return fmt.Errorf("extraction would escape destination: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return fmt.Errorf("mkdir %s: %w", target, err)
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fmt.Errorf("mkdir parent %s: %w", filepath.Dir(target), err)
		}
		mode := f.FileInfo().Mode().Perm()
		if filepath.Base(rel) == "auth.json" {
			mode = 0o600 // tighten secret files
		} else if mode == 0 {
			mode = 0o644
		}
		dstFile, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
		if err != nil {
			return fmt.Errorf("create %s: %w", target, err)
		}
		srcFile, err := f.Open()
		if err != nil {
			dstFile.Close()
			return fmt.Errorf("open zip entry %s: %w", f.Name, err)
		}
		// LimitReader as final defence — should be redundant after
		// validateWorkspaceZip's total budget check but cheap insurance.
		if _, err := io.Copy(dstFile, io.LimitReader(srcFile, maxWorkspaceExtractedBytes)); err != nil {
			srcFile.Close()
			dstFile.Close()
			return fmt.Errorf("copy %s: %w", target, err)
		}
		srcFile.Close()
		if err := dstFile.Close(); err != nil {
			return fmt.Errorf("close %s: %w", target, err)
		}
	}
	return nil
}

// ensureErrIsOSError keeps the linter happy in tight test paths.
var _ = errors.Is
