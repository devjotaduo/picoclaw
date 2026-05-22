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
// archive and creates a new Workspace row + on-disk directory from it.
// Form fields:
//
//	name                string  (required)
//	slug                string  (optional — derived from name if empty)
//	description         string  (optional)
//	is_default_auto     string  ("true"/"false", optional, default false)
//	is_available_manual string  ("true"/"false", optional, default true)
//	archive             file    (required) — see "Archive shapes" below
//
// Archive shapes accepted (auto-detected by detectArchiveLayout):
//
//  1. "home only" — every entry starts with `home/`. Stripped on extract
//     so files land at <ws>/home/. The historical shape.
//
//  2. "bare home" — no recognized top-level dir prefix. Treated as a
//     home/ payload too, landing at <ws>/home/. Backwards-compat.
//
//  3. "multi-folder" — every entry starts with one of the three known
//     top-level dirs (`home/`, `frontend-src/`, `frontend-dist/`). Each
//     entry is routed to its matching subdir on the workspace. Operator
//     can ship any subset (e.g. only `frontend-dist/` to refresh a
//     compiled bundle without touching home).
//
// The zip's content is validated against the path-traversal / size
// rules before anything lands on disk. Partial failures clean up the
// destination directory so the operator can retry.
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
	// state in the workspace dir.
	if err := validateWorkspaceZip(zipReader); err != nil {
		writeError(w, http.StatusBadRequest, "archive validation: "+err.Error())
		return
	}

	hostPath := filepath.Join(h.Cfg.WorkspaceDir, slug)

	// Reject if the slug is already in use on disk — overwriting an existing
	// workspace via upload would be a foot-gun.
	if _, err := os.Stat(hostPath); err == nil {
		writeError(
			w,
			http.StatusConflict,
			"a workspace already exists at "+hostPath+"; pick a different slug or delete it first",
		)
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

	// Extract into the workspace root. The extractor inspects the layout
	// and routes each entry to the matching subdir (home/, frontend-src/,
	// or frontend-dist/). The cleanup path removes the entire workspace
	// dir on extraction failure so the operator doesn't see a half-
	// written tree.
	cleanup := func() { _ = os.RemoveAll(hostPath) }
	if err := extractWorkspaceZip(zipReader, hostPath); err != nil {
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
		RolePolicyJSON:    rolePolicyJSON,
	}
	if err := h.Workspaces.Insert(r.Context(), ws); err != nil {
		cleanup()
		writeError(w, http.StatusInternalServerError, "insert workspace: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, summarizeWorkspace(ws))
}

// workspaceTopLevelSubdirs lists the directories an admin-managed
// workspace owns on disk. They're the only top-level prefixes the
// multi-folder upload layout accepts; any other top-level name forces
// the legacy "everything is home/" interpretation.
var workspaceTopLevelSubdirs = []string{
	tenant.WorkspaceHomeSubdir,         // "home"
	tenant.WorkspaceFrontendSrcSubdir,  // "frontend-src"
	tenant.WorkspaceFrontendDistSubdir, // "frontend-dist"
}

// archiveLayout describes how to interpret the uploaded zip.
type archiveLayout int

const (
	// layoutHomeStripped: every entry starts with `home/`. Strip that
	// prefix on extract; everything lands under <ws>/home/.
	layoutHomeStripped archiveLayout = iota
	// layoutBareHome: no recognized top-level dir prefix. Treat as a
	// raw home payload — entries land at <ws>/home/<entry>. Backwards-
	// compat with the original single-subtree upload.
	layoutBareHome
	// layoutMultiFolder: every entry starts with one of the known
	// workspace subdirs (home/, frontend-src/, frontend-dist/). Each
	// entry routes to its matching subdir as-is.
	layoutMultiFolder
)

// detectArchiveLayout inspects the zip's top-level names once and picks
// the layout. Empty archives are treated as layoutBareHome (the writer
// path no-ops on zero entries).
func detectArchiveLayout(zr *zip.Reader) archiveLayout {
	allowed := make(map[string]struct{}, len(workspaceTopLevelSubdirs))
	for _, s := range workspaceTopLevelSubdirs {
		allowed[s] = struct{}{}
	}
	seenTops := make(map[string]struct{})
	anyEntry := false
	for _, f := range zr.File {
		name := filepath.ToSlash(f.Name)
		if name == "" {
			continue
		}
		anyEntry = true
		// Top-level segment of the entry name.
		top := name
		if i := strings.IndexByte(name, '/'); i >= 0 {
			top = name[:i]
		}
		if _, ok := allowed[top]; !ok {
			// Any unknown top-level name forces the legacy bare-home
			// interpretation. Mixing 'home/x' with 'random.txt' would
			// land random.txt at <ws>/home/random.txt — which is the
			// historical behavior we don't want to regress.
			return layoutBareHome
		}
		seenTops[top] = struct{}{}
	}
	if !anyEntry {
		return layoutBareHome
	}
	// All tops are known workspace subdirs.
	if _, onlyHome := seenTops[tenant.WorkspaceHomeSubdir]; onlyHome && len(seenTops) == 1 {
		return layoutHomeStripped
	}
	return layoutMultiFolder
}

// archivePathForLayout converts a raw zip entry name to the relative path
// (forward-slashed) under the workspace root, applying the layout's
// stripping/routing rule. Returns ("", false) for entries that should be
// skipped entirely (e.g. the empty / placeholder dir entry "home").
func archivePathForLayout(rawName string, layout archiveLayout) (string, bool) {
	name := filepath.ToSlash(rawName)
	if name == "" {
		return "", false
	}
	switch layout {
	case layoutHomeStripped:
		// home/foo → home/foo (already prefixed; just keep it)
		// Operators sometimes ship a "home" placeholder dir entry —
		// MkdirAll for home/ runs once on workspace setup, so no work.
		if name == "home" || name == "home/" {
			return "", false
		}
		return name, true
	case layoutBareHome:
		// foo → home/foo
		return tenant.WorkspaceHomeSubdir + "/" + name, true
	case layoutMultiFolder:
		// home/foo → home/foo (no rewrite). frontend-src/foo → frontend-src/foo.
		// Skip the placeholder top-level dir entries — the workspace
		// setup already MkdirAll'd them.
		for _, top := range workspaceTopLevelSubdirs {
			if name == top || name == top+"/" {
				return "", false
			}
		}
		return name, true
	}
	return "", false
}

// validateWorkspaceZip walks the archive and rejects MALICIOUS inputs only:
//   - paths with .. or absolute paths (path traversal)
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
func validateWorkspaceZip(zr *zip.Reader) error {
	if len(zr.File) > maxWorkspaceExtractedFiles {
		return fmt.Errorf("archive has %d files; cap is %d", len(zr.File), maxWorkspaceExtractedFiles)
	}

	var total int64
	layout := detectArchiveLayout(zr)
	for _, f := range zr.File {
		rel, keep := archivePathForLayout(f.Name, layout)
		if !keep {
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
		// shouldHideTenantPath only knows about home-subtree paths. Apply
		// the predicate to the home-relative slice of the cleaned path.
		// Anything outside home/ (frontend-src/, frontend-dist/) doesn't
		// get the runtime-skip treatment — those directories don't have
		// runtime state semantics.
		if homeRel, isHome := strings.CutPrefix(cleaned, tenant.WorkspaceHomeSubdir+"/"); isHome {
			if shouldHideTenantPath(homeRel, f.FileInfo().IsDir()) {
				continue
			}
		}
		total += int64(f.UncompressedSize64)
		if total > maxWorkspaceExtractedBytes {
			return fmt.Errorf("archive expands beyond the %d byte cap (zip bomb?)", maxWorkspaceExtractedBytes)
		}
	}
	return nil
}

// extractWorkspaceZip writes the archive contents into dst (the workspace
// host_path). Each entry is routed to its matching subdir based on the
// detected layout — see archiveLayout for the three accepted shapes.
// Assumes validateWorkspaceZip already passed (this function does NOT
// re-check for malicious paths beyond a final containment assert).
//
// Runtime-only entries (sessions/, whatsapp/, state/, *.pid, etc.) inside
// the home/ subtree are silently skipped — they're either re-created by
// the launcher on first boot or owned exclusively by the provisioner.
// Lets operators upload a zip of a live tenant volume without curating it.
func extractWorkspaceZip(zr *zip.Reader, dst string) error {
	layout := detectArchiveLayout(zr)
	dstAbs, err := filepath.Abs(dst)
	if err != nil {
		return err
	}
	for _, f := range zr.File {
		rel, keep := archivePathForLayout(f.Name, layout)
		if !keep {
			continue
		}
		cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(rel)))
		// Runtime-skip applies only to the home/ subtree; see validator
		// for the rationale.
		if homeRel, isHome := strings.CutPrefix(cleaned, tenant.WorkspaceHomeSubdir+"/"); isHome {
			if shouldHideTenantPath(homeRel, f.FileInfo().IsDir()) {
				continue
			}
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
