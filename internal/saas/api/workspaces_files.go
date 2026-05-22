package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// maxWorkspaceTreeEntries caps how many entries the tree endpoint returns
// to defend against a workspace pointed at /usr or similar; the inline
// editor isn't useful past a few hundred files anyway.
const maxWorkspaceTreeEntries = 5000

// workspaceTreeEntry is one row in the tree response. Flat list — the
// frontend builds the visual tree. Path follows the same convention as
// the existing /files read/write handlers (e.g. "home/config.json",
// "home/workspace/AGENT.md") so the same string can be passed to both
// the tree endpoint result and the content endpoints.
type workspaceTreeEntry struct {
	Path   string `json:"path"`
	IsDir  bool   `json:"is_dir"`
	Size   int64  `json:"size"`
	IsText bool   `json:"is_text"`
}

type workspaceTreeResponse struct {
	WorkspaceID string               `json:"workspace_id"`
	Subtrees    []string             `json:"subtrees"` // ["home", "frontend-src"] — order matters in UI
	Entries     []workspaceTreeEntry `json:"entries"`
	Truncated   bool                 `json:"truncated,omitempty"`
}

// handleWorkspaceFilesTree returns a flat list of every file/dir under the
// workspace's editable subtrees (home/ and frontend-src/; frontend-dist/ is
// generated output and not exposed). Companion to the existing
// /workspaces/{id}/files read/write endpoints.
//
// Skips hidden runtime files the operator can't usefully edit (launcher
// auth DB, the controlplane-managed launcher_policy.json, pid files).
func (h *Handler) handleWorkspaceFilesTree(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}

	subtrees := []string{
		tenant.WorkspaceHomeSubdir,
		tenant.WorkspaceFrontendSrcSubdir,
	}

	entries := make([]workspaceTreeEntry, 0, 128)
	truncated := false

	for _, sub := range subtrees {
		root := filepath.Join(ws.HostPath, sub)
		info, err := os.Stat(root)
		if err != nil || !info.IsDir() {
			continue // missing subtree just contributes no entries
		}
		err = filepath.Walk(root, func(p string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				// Skip unreadable entries quietly — defence against partial
				// permissions, broken symlinks, etc. Surface as "tree had
				// fewer entries" not "tree call failed".
				return nil
			}
			rel, err := filepath.Rel(ws.HostPath, p)
			if err != nil || rel == "." {
				return nil
			}
			if shouldHideWorkspaceFile(filepath.Base(rel)) {
				if info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			if len(entries) >= maxWorkspaceTreeEntries {
				truncated = true
				return filepath.SkipAll
			}
			entry := workspaceTreeEntry{
				Path:  filepath.ToSlash(rel),
				IsDir: info.IsDir(),
			}
			if !info.IsDir() {
				entry.Size = info.Size()
				entry.IsText = looksLikeWorkspaceText(p)
			}
			entries = append(entries, entry)
			return nil
		})
		if err != nil && err != filepath.SkipAll {
			writeError(w, http.StatusInternalServerError, "walk "+sub+": "+err.Error())
			return
		}
		if truncated {
			break
		}
	}

	writeJSON(w, http.StatusOK, workspaceTreeResponse{
		WorkspaceID: ws.ID,
		Subtrees:    subtrees,
		Entries:     entries,
		Truncated:   truncated,
	})
}

// shouldHideWorkspaceFile lists names the inline editor never exposes —
// runtime state managed by the launcher or the provisioner, secrets, and
// pid/socket files. Editing any of these would corrupt the tenant; the
// operator should never see them in the file tree.
func shouldHideWorkspaceFile(base string) bool {
	switch base {
	case ".picoclaw.pid",
		"launcher-auth.db",
		"launcher_policy.json",
		"litellm.key",
		"state",
		"sessions",
		"whatsapp",
		"runtime-user-env",
		"logs",
		"node_modules",
		".git":
		return true
	}
	return false
}

// looksLikeWorkspaceText is a heuristic to flag binary files so the frontend
// can grey them out / refuse to open. False negatives are fine — the read
// endpoint will return 415 on actual binary content; we just don't want the
// tree showing images as editable.
func looksLikeWorkspaceText(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
		".zip", ".tar", ".gz", ".bz2", ".xz", ".7z",
		".mp3", ".mp4", ".webm", ".mov", ".avi",
		".woff", ".woff2", ".ttf", ".otf",
		".db", ".sqlite", ".sqlite3":
		return false
	}
	return true
}
