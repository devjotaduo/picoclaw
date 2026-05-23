package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// slugInvalid matches every character that's NOT a lowercase-hex slug char,
// used to normalize human-typed names like "Default Business" into the
// canonical "default-business" form that workspaces.slug stores.
var slugInvalid = regexp.MustCompile(`[^a-z0-9-]+`)

func normalizeSlug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugInvalid.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	for strings.Contains(s, "--") {
		s = strings.ReplaceAll(s, "--", "-")
	}
	if len(s) > 40 {
		s = strings.Trim(s[:40], "-")
	}
	return s
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return strings.Repeat("0", n*2)
	}
	return hex.EncodeToString(b)
}

// Workspaces HTTP layer — single CRUD surface that replaces the LauncherProfile
// + TenantTemplateDir + AutoProvisionWorkspaceDir pile. The admin panel calls
// these endpoints to manage workspaces; provisioning reads from the same DB
// rows. File CRUD is intentionally narrow (read/write a text file by path)
// for MVP — operators can SSH into <Cfg.WorkspaceDir>/<slug>/ for bulk edits.

const maxWorkspaceFileBytes = 2 << 20 // 2 MiB — generous for AGENT.md / config.json / .tsx

type workspaceReq struct {
	Name              string            `json:"name"`
	Slug              string            `json:"slug"`
	Description       string            `json:"description"`
	IsAvailableManual bool              `json:"is_available_manual"`
	IsRaw             bool              `json:"is_raw"`
	RolePolicy        policy.RolePolicy `json:"role_policy"`
}

func (h *Handler) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	availableManualOnly := r.URL.Query().Get("manual_only") == "true"
	rows, err := h.Workspaces.List(r.Context(), availableManualOnly)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, ws := range rows {
		out = append(out, summarizeWorkspace(ws))
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": out})
}

// handleCreateWorkspace creates a fresh workspace at <Cfg.WorkspaceDir>/<slug>/.
// The directory is initialized empty — operator (or the import-from-home
// endpoint) is responsible for populating home/ and frontend-src/. We don't
// auto-copy from the operator's $PICOCLAW_HOME here because that would mix
// "starting from scratch" with "duplicating production"; the latter has its
// own endpoint.
func (h *Handler) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var req workspaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	slug := normalizeSlug(req.Slug)
	if slug == "" {
		slug = normalizeSlug(name)
	}
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}
	id := slug + "-" + randomHex(3)
	hostPath := filepath.Join(h.Cfg.WorkspaceDir, slug)

	// Pre-create the three subdirs so SSH-edits and the build command have a
	// known shape from the start. frontend-dist/ stays empty until the
	// operator clicks "Compilar".
	for _, sub := range []string{tenant.WorkspaceHomeSubdir, tenant.WorkspaceFrontendSrcSubdir, tenant.WorkspaceFrontendDistSubdir} {
		if err := os.MkdirAll(filepath.Join(hostPath, sub), 0o755); err != nil {
			writeError(w, http.StatusInternalServerError, "create workspace dir: "+err.Error())
			return
		}
	}

	rolePolicyJSON, err := store.MarshalRolePolicy(req.RolePolicy)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role_policy")
		return
	}
	ws := &store.Workspace{
		ID:                id,
		Name:              name,
		Slug:              slug,
		Description:       strings.TrimSpace(req.Description),
		HostPath:          hostPath,
		IsAvailableManual: req.IsAvailableManual,
		IsRaw:             req.IsRaw,
		RolePolicyJSON:    rolePolicyJSON,
	}
	if err := h.Workspaces.Insert(r.Context(), ws); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, summarizeWorkspace(ws))
}

func (h *Handler) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, summarizeWorkspace(ws))
}

func (h *Handler) handleUpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	var req workspaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	slug := normalizeSlug(req.Slug)
	if slug == "" {
		slug = normalizeSlug(name)
	}
	rolePolicyJSON, err := store.MarshalRolePolicy(req.RolePolicy)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role_policy")
		return
	}
	ws.Name = name
	ws.Slug = slug
	ws.Description = strings.TrimSpace(req.Description)
	ws.IsAvailableManual = req.IsAvailableManual
	ws.IsRaw = req.IsRaw
	ws.RolePolicyJSON = rolePolicyJSON
	if err := h.Workspaces.Update(r.Context(), ws); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summarizeWorkspace(ws))
}

func (h *Handler) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Workspaces.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrWorkspaceNotFound) {
			writeError(w, http.StatusBadRequest, "workspace not found or is default-auto")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	// The on-disk tree stays put — operator may want to inspect it before
	// rm -rf'ing manually. Auto-deleting would also race with any tenant
	// container still bind-mounting frontend-dist/.
	w.WriteHeader(http.StatusNoContent)
}

// handleBuildWorkspaceFrontend kicks off a vite build inside a node:24-alpine
// sidecar container. The call is synchronous — completes in 30-90s on a warm
// pnpm cache, up to 5 min on a cold one. Front-end shows a spinner +
// streaming log isn't worth the complexity for a once-per-edit operation.
func (h *Handler) handleBuildWorkspaceFrontend(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	log, buildErr := tenant.BuildWorkspaceFrontend(r.Context(), ws.HostPath)
	now := time.Now().UTC()
	if err := h.Workspaces.SetFrontendBuilt(r.Context(), ws.ID, now, log); err != nil {
		writeError(w, http.StatusInternalServerError, "save build log: "+err.Error())
		return
	}
	// Always return 200 with a structured {ok, log_tail, error} body. The
	// admin's fetch wrapper throws on non-2xx — surfacing the build log
	// requires the response to be parseable, so failure is encoded as
	// ok=false in the JSON rather than an HTTP error status.
	resp := map[string]any{
		"ok":       buildErr == nil,
		"built_at": now,
		"log_tail": logTail(log, 2048),
	}
	if buildErr != nil {
		resp["error"] = buildErr.Error()
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleReadWorkspaceFile returns the text content of a file inside the
// workspace's home/ or frontend-src/ tree. The `path` query param is the
// path relative to the workspace root (e.g. "home/config.json" or
// "frontend-src/src/App.tsx"). Symlinks are rejected; size capped.
func (h *Handler) handleReadWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	rel := strings.TrimSpace(r.URL.Query().Get("path"))
	full, err := resolveWorkspaceFile(ws.HostPath, rel)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	info, err := os.Lstat(full)
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if info.Mode()&os.ModeSymlink != 0 {
		writeError(w, http.StatusBadRequest, "symlinks are not allowed")
		return
	}
	if info.Size() > maxWorkspaceFileBytes {
		writeError(
			w,
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("file is larger than %d bytes", maxWorkspaceFileBytes),
		)
		return
	}
	data, err := os.ReadFile(full)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read file: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    rel,
		"content": string(data),
		"size":    info.Size(),
		"mode":    fmt.Sprintf("%o", info.Mode().Perm()),
	})
}

type writeWorkspaceFileReq struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (h *Handler) handleWriteWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	var req writeWorkspaceFileReq
	if err := json.NewDecoder(io.LimitReader(r.Body, maxWorkspaceFileBytes+1024)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(req.Content) > maxWorkspaceFileBytes {
		writeError(
			w,
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("content larger than %d bytes", maxWorkspaceFileBytes),
		)
		return
	}
	if vErr := validateWorkspaceFileContent(req.Path, req.Content); vErr != nil {
		writeError(w, http.StatusBadRequest, vErr.Error())
		return
	}
	full, err := resolveWorkspaceFile(ws.HostPath, req.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Refuse to overwrite a directory.
	if info, err := os.Stat(full); err == nil && info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is a directory")
		return
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "mkdir: "+err.Error())
		return
	}
	// Preserve existing mode bits — config.json / .security.yml are often
	// 0600 because they hold secrets. New files default to 0600 (secure)
	// for anything under home/, 0644 for frontend-src/ source code.
	preserveMode := os.FileMode(0)
	if info, err := os.Lstat(full); err == nil {
		preserveMode = info.Mode().Perm()
	}
	// Atomic write: create temp in the same dir, write, fsync via Close,
	// then rename over the target. Prevents readers (provisioner copying
	// the workspace, container starting up) from seeing a truncated file
	// mid-write — see the matching pattern in tenants_files.go.
	parent := filepath.Dir(full)
	tmp, err := os.CreateTemp(parent, filepath.Base(full)+".tmp-*")
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
	if err := os.Rename(tmpPath, full); err != nil {
		cleanup()
		writeError(w, http.StatusInternalServerError, "rename: "+err.Error())
		return
	}
	// Restore mode bits. CreateTemp gives 0600; widen to 0644 for files
	// outside home/ when there's no prior mode to preserve. The path has
	// already been validated by resolveWorkspaceFile, so cleanedRel is one
	// of the three known subtrees.
	finalMode := preserveMode
	if finalMode == 0 {
		cleanedRel := filepath.Clean(req.Path)
		homePrefix := tenant.WorkspaceHomeSubdir + string(filepath.Separator)
		if cleanedRel == tenant.WorkspaceHomeSubdir || strings.HasPrefix(cleanedRel, homePrefix) {
			finalMode = 0o600
		} else {
			finalMode = 0o644
		}
	}
	if err := os.Chmod(full, finalMode); err != nil {
		writeError(w, http.StatusInternalServerError, "chmod: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleImportWorkspaceFromHome bootstraps a workspace by copying the
// operator's $PICOCLAW_HOME into <Cfg.WorkspaceDir>/<slug>/home/, sanitizing
// runtime state on the way. Useful for "create the first workspace mirroring
// what's already in prod" right after the migration lands. The body picks
// the source path; when omitted, the handler defaults to $PICOCLAW_HOME
// (or ~/.picoclaw if that's unset) so the admin button labeled "Importar
// do $PICOCLAW_HOME" doesn't need to know the path.
type importFromHomeReq struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	SourcePath  string `json:"source_path"`
}

// defaultImportSource returns the host path the import-from-home endpoint
// should read when the request omits source_path. Order:
//
//  1. $PICOCLAW_HOME — set by the controlplane container env so operators
//     can point at any mounted dir.
//  2. ~/.picoclaw — the picoclaw library default for "current operator's
//     home" (see pkg/config/envkeys.go).
//
// Returns "" when neither resolves, in which case the handler 400s with a
// clear "set $PICOCLAW_HOME or pass source_path" message.
func defaultImportSource() string {
	if v := strings.TrimSpace(os.Getenv("PICOCLAW_HOME")); v != "" {
		return v
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".picoclaw")
	}
	return ""
}

func (h *Handler) handleImportWorkspaceFromHome(w http.ResponseWriter, r *http.Request) {
	var req importFromHomeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	src := strings.TrimSpace(req.SourcePath)
	if src == "" {
		src = defaultImportSource()
	}
	if src == "" {
		writeError(w, http.StatusBadRequest, "source_path missing and $PICOCLAW_HOME is not set on the controlplane")
		return
	}
	if info, err := os.Stat(src); err != nil || !info.IsDir() {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("source_path %s is not a readable directory", src))
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Importado"
	}
	slug := normalizeSlug(req.Slug)
	if slug == "" {
		slug = normalizeSlug(name)
	}
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}
	id := slug + "-" + randomHex(3)
	hostPath := filepath.Join(h.Cfg.WorkspaceDir, slug)
	homeDir := filepath.Join(hostPath, tenant.WorkspaceHomeSubdir)
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "mkdir workspace: "+err.Error())
		return
	}
	// CopyVolumeRaw skips the operator's runtime state already (PID files,
	// SQLite journals). We still strip the per-tenant secrets that may have
	// leaked into the operator's home (launcher-auth.db, litellm.key) so the
	// resulting workspace doesn't carry stale credentials. The actual
	// filename comes from web/backend/dashboardauth/sql.go (DBFilename).
	if err := tenant.CopyVolumeRaw(src, homeDir); err != nil {
		writeError(w, http.StatusInternalServerError, "copy source: "+err.Error())
		return
	}
	for _, junk := range []string{"launcher-auth.db", "litellm.key", "state", "workspace/sessions", "workspace/whatsapp", "workspace/matrix", "runtime-user-env"} {
		_ = os.RemoveAll(filepath.Join(homeDir, junk))
	}
	// frontend-src/ stays empty — operator uploads code via the file PUT
	// endpoint or SSH. We don't auto-copy <repo>/web/frontend because the
	// controlplane doesn't ship the React source tree.
	for _, sub := range []string{tenant.WorkspaceFrontendSrcSubdir, tenant.WorkspaceFrontendDistSubdir} {
		_ = os.MkdirAll(filepath.Join(hostPath, sub), 0o755)
	}
	ws := &store.Workspace{
		ID:                id,
		Name:              name,
		Slug:              slug,
		Description:       strings.TrimSpace(req.Description),
		HostPath:          hostPath,
		IsAvailableManual: true,
	}
	if err := h.Workspaces.Insert(r.Context(), ws); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, summarizeWorkspace(ws))
}

// getWorkspace resolves the workspace id from chi URL and writes a 404 to w
// when missing. Returns (nil, false) on error so callers short-circuit.
func (h *Handler) getWorkspace(w http.ResponseWriter, r *http.Request) (*store.Workspace, bool) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return nil, false
	}
	ws, err := h.Workspaces.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrWorkspaceNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return nil, false
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return nil, false
	}
	return ws, true
}

func summarizeWorkspace(ws *store.Workspace) map[string]any {
	frontendBuiltAt := any(nil)
	if ws.FrontendBuiltAt != nil {
		frontendBuiltAt = ws.FrontendBuiltAt
	}
	return map[string]any{
		"id":                  ws.ID,
		"name":                ws.Name,
		"slug":                ws.Slug,
		"description":         ws.Description,
		"host_path":           ws.HostPath,
		"is_available_manual": ws.IsAvailableManual,
		"is_raw":              ws.IsRaw,
		"role_policy":         ws.RolePolicy(),
		"frontend_built_at":   frontendBuiltAt,
		"version":             ws.Version,
		"created_at":          ws.CreatedAt,
		"updated_at":          ws.UpdatedAt,
	}
}

// resolveWorkspaceFile joins workspace host_path with rel, then verifies the
// result is still inside the workspace (rejects "..", absolute paths, and
// symlink-bypass escapes). Allowed top-level subdirs are home/, frontend-src/,
// and frontend-dist/ — anything else 400s.
func resolveWorkspaceFile(hostPath, rel string) (string, error) {
	rel = strings.TrimSpace(rel)
	if rel == "" {
		return "", errors.New("path query param is required")
	}
	if strings.HasPrefix(rel, "/") || strings.HasPrefix(rel, `\`) {
		return "", errors.New("path must be relative")
	}
	cleaned := filepath.Clean(rel)
	if cleaned == "." || strings.HasPrefix(cleaned, "..") ||
		strings.Contains(cleaned, ".."+string(filepath.Separator)) {
		return "", errors.New("path must not contain ..")
	}
	// Only allow files inside the three known subtrees.
	allowed := false
	for _, sub := range []string{tenant.WorkspaceHomeSubdir, tenant.WorkspaceFrontendSrcSubdir, tenant.WorkspaceFrontendDistSubdir} {
		if cleaned == sub || strings.HasPrefix(cleaned, sub+string(filepath.Separator)) {
			allowed = true
			break
		}
	}
	if !allowed {
		return "", errors.New("path must start with home/, frontend-src/, or frontend-dist/")
	}
	full := filepath.Join(hostPath, cleaned)
	// Belt-and-braces: resolve absolute and re-check it's still under hostPath.
	absHost, err := filepath.Abs(hostPath)
	if err != nil {
		return "", err
	}
	absFull, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(absFull, absHost+string(filepath.Separator)) && absFull != absHost {
		return "", errors.New("path escapes workspace root")
	}
	return full, nil
}

func logTail(s string, n int) string {
	if n <= 0 || len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}

// validateWorkspaceFileContent applies cheap shape checks to known-schema
// files before they're written to disk. The goal is to fail at edit time
// with a clear message instead of letting a malformed template ship to
// every newly-provisioned tenant and surface as opaque 500s in the
// launcher console.
//
// Today we only catch the `model_list[].api_key` bug (singular instead
// of plural `api_keys`) — historically the #1 reason auto-provision
// produced "active" tenants that 500'd on every workspace endpoint. Add
// more checks here as new template traps surface.
func validateWorkspaceFileContent(relPath, content string) error {
	cleanedRel := filepath.Clean(relPath)
	switch cleanedRel {
	case filepath.Join(tenant.WorkspaceHomeSubdir, "config.json"):
		return validateConfigJSON(content)
	}
	return nil
}

func validateConfigJSON(content string) error {
	var m map[string]any
	if err := json.Unmarshal([]byte(content), &m); err != nil {
		return fmt.Errorf("config.json is not valid JSON: %w", err)
	}
	list, _ := m["model_list"].([]any)
	for i, entry := range list {
		em, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if _, has := em["api_key"]; has {
			return fmt.Errorf(
				"model_list[%d].api_key is rejected by the launcher (unknown field). "+
					"Rename it to api_keys and wrap the value in an array, e.g. "+
					`"api_keys": ["${LITELLM_KEY}"]`,
				i,
			)
		}
	}
	return nil
}
