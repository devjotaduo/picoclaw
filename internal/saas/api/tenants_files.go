package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// maxTenantFileBytes mirrors maxWorkspaceFileBytes — the inline editor is
// text-only and 2 MiB is generous for any AGENT.md, SOUL.md, behavior.json,
// or memory file an operator might realistically edit through the UI.
const maxTenantFileBytes = 2 << 20 // 2 MiB

// maxTenantTreeEntries caps how many entries the tree endpoint returns.
// 5000 is enough for any sane tenant; beyond that the tree UI gets unusable
// and we'd rather truncate than ship megabytes of metadata.
const maxTenantTreeEntries = 5000

type tenantFileTreeEntry struct {
	Path   string `json:"path"`
	IsDir  bool   `json:"is_dir"`
	Size   int64  `json:"size"`
	IsText bool   `json:"is_text"`
}

type tenantFileTreeResponse struct {
	TenantID  string                `json:"tenant_id"`
	Root      string                `json:"root"` // always the volume path inside the controlplane mount
	Entries   []tenantFileTreeEntry `json:"entries"`
	Truncated bool                  `json:"truncated,omitempty"`
}

type tenantFileReadResponse struct {
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	Content string `json:"content"`
}

type tenantFileWriteRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// handleTenantFilesTree returns a flat list of editable files inside the
// tenant's bind-mounted volume. Hidden / runtime / secret paths are filtered
// out aggressively so the operator never sees state that would corrupt the
// running tenant if edited (dashboardauth.db, sessions/, whatsapp store,
// litellm.key, etc.).
//
// IMPORTANT vs the workspaces editor: tenant containers are LIVE. Saving
// config.json or workspace/AGENT.md while the launcher is running takes
// effect on the next agent loop (some configs) or only after a recreate
// (gateway settings). The UI warns about this.
func (h *Handler) handleTenantFilesTree(w http.ResponseWriter, r *http.Request) {
	t, ok := h.tenantForFiles(w, r)
	if !ok {
		return
	}
	root := t.VolumePath
	info, err := os.Stat(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(w, http.StatusNotFound, "tenant volume not found at "+root)
			return
		}
		writeError(w, http.StatusInternalServerError, "stat tenant volume: "+err.Error())
		return
	}
	if !info.IsDir() {
		writeError(w, http.StatusInternalServerError, "tenant volume is not a directory")
		return
	}

	entries := make([]tenantFileTreeEntry, 0, 64)
	truncated := false

	walkErr := filepath.Walk(root, func(p string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		rel, err := filepath.Rel(root, p)
		if err != nil || rel == "." {
			return nil
		}
		if shouldHideTenantPath(rel, info.IsDir()) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if len(entries) >= maxTenantTreeEntries {
			truncated = true
			return filepath.SkipAll
		}
		entry := tenantFileTreeEntry{
			Path:  filepath.ToSlash(rel),
			IsDir: info.IsDir(),
		}
		if !info.IsDir() {
			entry.Size = info.Size()
			entry.IsText = looksLikeWorkspaceText(p) // reuse the same binary-extension allowlist
		}
		entries = append(entries, entry)
		return nil
	})
	if walkErr != nil && walkErr != filepath.SkipAll {
		writeError(w, http.StatusInternalServerError, "walk tenant: "+walkErr.Error())
		return
	}

	writeJSON(w, http.StatusOK, tenantFileTreeResponse{
		TenantID:  t.ID,
		Root:      root,
		Entries:   entries,
		Truncated: truncated,
	})
}

// handleTenantFileRead returns the text content of a single file inside the
// tenant volume. Binary files are rejected with 415; oversized files with
// 413. Path is the relative path from the volume root (e.g.
// "workspace/AGENT.md", "config.json").
func (h *Handler) handleTenantFileRead(w http.ResponseWriter, r *http.Request) {
	t, ok := h.tenantForFiles(w, r)
	if !ok {
		return
	}
	relPath, abs, ok := resolveTenantFilePath(w, r.URL.Query().Get("path"), t.VolumePath)
	if !ok {
		return
	}
	info, err := os.Lstat(abs)
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if info.Mode()&os.ModeSymlink != 0 {
		writeError(w, http.StatusBadRequest, "symlinks are not allowed")
		return
	}
	if info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is a directory")
		return
	}
	if info.Size() > maxTenantFileBytes {
		writeError(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("file is %d bytes; max for inline editor is %d", info.Size(), maxTenantFileBytes))
		return
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read: "+err.Error())
		return
	}
	if !utf8.Valid(data) {
		writeError(w, http.StatusUnsupportedMediaType, "file is binary or invalid UTF-8; not editable inline")
		return
	}
	writeJSON(w, http.StatusOK, tenantFileReadResponse{
		Path:    relPath,
		Size:    info.Size(),
		Mode:    fmt.Sprintf("%o", info.Mode().Perm()),
		Content: string(data),
	})
}

// handleTenantFileWrite replaces the file contents. The parent directory
// must already exist (we don't auto-create deep new paths — same constraint
// as the workspaces editor). Writes are atomic via temp + rename.
func (h *Handler) handleTenantFileWrite(w http.ResponseWriter, r *http.Request) {
	t, ok := h.tenantForFiles(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxTenantFileBytes+1024)
	defer r.Body.Close()

	var req tenantFileWriteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json or body too large: "+err.Error())
		return
	}
	if int64(len(req.Content)) > maxTenantFileBytes {
		writeError(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("content is %d bytes; max for inline editor is %d", len(req.Content), maxTenantFileBytes))
		return
	}
	if !utf8.ValidString(req.Content) {
		writeError(w, http.StatusBadRequest, "content must be valid UTF-8 (inline editor is text-only)")
		return
	}
	relPath, abs, ok := resolveTenantFilePath(w, req.Path, t.VolumePath)
	if !ok {
		return
	}
	// Refuse to overwrite a directory.
	if info, err := os.Stat(abs); err == nil && info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is a directory")
		return
	}
	parent := filepath.Dir(abs)
	if _, err := os.Stat(parent); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(w, http.StatusBadRequest, "parent directory does not exist; create it via SSH first (inline editor does not create dirs)")
			return
		}
		writeError(w, http.StatusInternalServerError, "stat parent: "+err.Error())
		return
	}
	tmp, err := os.CreateTemp(parent, filepath.Base(abs)+".tmp-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create temp: "+err.Error())
		return
	}
	tmpPath := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpPath) }
	if _, err := io.WriteString(tmp, req.Content); err != nil {
		_ = tmp.Close()
		cleanup()
		writeError(w, http.StatusInternalServerError, "write temp: "+err.Error())
		return
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		writeError(w, http.StatusInternalServerError, "close temp: "+err.Error())
		return
	}
	if err := os.Rename(tmpPath, abs); err != nil {
		cleanup()
		writeError(w, http.StatusInternalServerError, "rename: "+err.Error())
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "post-write stat: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tenantFileReadResponse{
		Path:    relPath,
		Size:    info.Size(),
		Mode:    fmt.Sprintf("%o", info.Mode().Perm()),
		Content: req.Content,
	})
}

// tenantForFiles loads a tenant by URL {id} for the files endpoints, writing
// the appropriate HTTP error and returning ok=false on missing/deleted.
// Returns the store row directly so callers can access VolumePath without
// another lookup.
func (h *Handler) tenantForFiles(w http.ResponseWriter, r *http.Request) (*store.Tenant, bool) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id required")
		return nil, false
	}
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
			return nil, false
		}
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return nil, false
	}
	if t.VolumePath == "" {
		writeError(w, http.StatusConflict, "tenant has no volume_path; cannot edit files")
		return nil, false
	}
	return t, true
}

// resolveTenantFilePath validates a user-supplied relative path and returns
// (cleaned-rel, absolute, ok). On any validation failure writes the HTTP
// error and returns ok=false.
func resolveTenantFilePath(w http.ResponseWriter, raw string, volumePath string) (string, string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		writeError(w, http.StatusBadRequest, "path query parameter / body field is required")
		return "", "", false
	}
	if strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, `\`) {
		writeError(w, http.StatusBadRequest, "path must be relative to the tenant volume root")
		return "", "", false
	}
	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(raw)))
	if cleaned == "." || cleaned == "" {
		writeError(w, http.StatusBadRequest, "path resolves to volume root; specify a file inside it")
		return "", "", false
	}
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") || strings.Contains(cleaned, "/../") {
		writeError(w, http.StatusBadRequest, "path may not escape the tenant volume")
		return "", "", false
	}
	// Block the protected paths even if the operator hand-typed them.
	if shouldBlockTenantWrite(cleaned) {
		writeError(w, http.StatusForbidden, "this path is managed by the controlplane / launcher and cannot be edited inline")
		return "", "", false
	}
	abs := filepath.Clean(filepath.Join(volumePath, filepath.FromSlash(cleaned)))
	volAbs := filepath.Clean(volumePath)
	if abs != volAbs && !strings.HasPrefix(abs, volAbs+string(filepath.Separator)) {
		writeError(w, http.StatusBadRequest, "resolved path escapes tenant volume")
		return "", "", false
	}
	return cleaned, abs, true
}

// shouldHideTenantPath filters tree output. Hides runtime state, secrets,
// and provisioner-managed files so they never appear in the file picker.
// The check is on the relative path (forward-slashed) so it works across
// platforms.
func shouldHideTenantPath(rel string, isDir bool) bool {
	rel = filepath.ToSlash(rel)
	base := filepath.Base(rel)
	// Top-level hidden names — these are runtime state or provisioner-owned.
	switch base {
	case ".picoclaw.pid",
		"launcher-auth.db",
		"launcher_policy.json",
		"litellm.key",
		".picoclaw-admin.creds":
		return true
	}
	// Hidden subtrees: anything under these prefixes is filtered (dir or file).
	hiddenPrefixes := []string{
		"sessions",
		"whatsapp",
		"state",
		"logs",
		"runtime-user-env",
		"backups",
		"node_modules",
		".cache",
		".git",
		"workspace/sessions",
		"workspace/whatsapp",
		"workspace/state",
		"workspace/runtime-user-env",
		"workspace/logs",
	}
	for _, p := range hiddenPrefixes {
		if rel == p || strings.HasPrefix(rel, p+"/") {
			return true
		}
	}
	_ = isDir
	return false
}

// shouldBlockTenantWrite is the writer-side gate (defence in depth: the tree
// already hides these, but a hand-crafted PUT shouldn't be able to corrupt
// runtime state).
func shouldBlockTenantWrite(rel string) bool {
	return shouldHideTenantPath(rel, false)
}
