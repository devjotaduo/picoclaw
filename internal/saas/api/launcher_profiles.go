package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

type launcherProfileReq struct {
	Name        string            `json:"name"`
	Slug        string            `json:"slug"`
	Description string            `json:"description"`
	IsDefault   bool              `json:"is_default"`
	RolePolicy  policy.RolePolicy `json:"role_policy"`
}

func (h *Handler) handleListLauncherProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := h.Profiles.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	out := make([]map[string]any, 0, len(profiles))
	for _, p := range profiles {
		out = append(out, summarizeLauncherProfile(p))
	}
	writeJSON(w, http.StatusOK, map[string]any{"profiles": out})
}

func (h *Handler) handleCreateLauncherProfile(w http.ResponseWriter, r *http.Request) {
	var req launcherProfileReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	slug := normalizeProfileSlug(req.Slug)
	if slug == "" {
		slug = normalizeProfileSlug(name)
	}
	if slug == "" {
		writeError(w, http.StatusBadRequest, "slug is required")
		return
	}
	id := slug + "-" + randomHex(3)
	seedPath := filepath.Join(h.Cfg.TenantProfileDir, id, "seed")
	if err := os.MkdirAll(seedPath, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "seed dir error")
		return
	}
	rolePolicyJSON, err := store.MarshalRolePolicy(req.RolePolicy)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role_policy")
		return
	}
	p := &store.LauncherProfile{
		ID:             id,
		Name:           name,
		Slug:           slug,
		Description:    strings.TrimSpace(req.Description),
		IsDefault:      req.IsDefault,
		Version:        1,
		SeedPath:       seedPath,
		RolePolicyJSON: rolePolicyJSON,
	}
	if err := h.Profiles.Insert(r.Context(), p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, summarizeLauncherProfile(p))
}

func (h *Handler) handleGetLauncherProfile(w http.ResponseWriter, r *http.Request) {
	p, ok := h.getLauncherProfile(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, summarizeLauncherProfile(p))
}

func (h *Handler) handleUpdateLauncherProfile(w http.ResponseWriter, r *http.Request) {
	p, ok := h.getLauncherProfile(w, r)
	if !ok {
		return
	}
	var req launcherProfileReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	slug := normalizeProfileSlug(req.Slug)
	if slug == "" {
		slug = normalizeProfileSlug(name)
	}
	rolePolicyJSON, err := store.MarshalRolePolicy(req.RolePolicy)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role_policy")
		return
	}
	p.Name = name
	p.Slug = slug
	p.Description = strings.TrimSpace(req.Description)
	p.IsDefault = req.IsDefault
	p.RolePolicyJSON = rolePolicyJSON
	if err := h.Profiles.Update(r.Context(), p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summarizeLauncherProfile(p))
}

func (h *Handler) handleDeleteLauncherProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Profiles.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrLauncherProfileNotFound) {
			writeError(w, http.StatusBadRequest, "profile not found or is default")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleGetLauncherProfileSeed(w http.ResponseWriter, r *http.Request) {
	p, ok := h.getLauncherProfile(w, r)
	if !ok {
		return
	}
	files, err := tenant.ReadSeedFiles(p.SeedPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, files)
}

func (h *Handler) handlePutLauncherProfileSeed(w http.ResponseWriter, r *http.Request) {
	p, ok := h.getLauncherProfile(w, r)
	if !ok {
		return
	}
	var files tenant.SeedFiles
	if err := json.NewDecoder(r.Body).Decode(&files); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := tenant.WriteSeedFiles(p.SeedPath, files); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.Profiles.Update(r.Context(), p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summarizeLauncherProfile(p))
}

func (h *Handler) handleImportStandaloneLauncherProfile(w http.ResponseWriter, r *http.Request) {
	p, ok := h.getLauncherProfile(w, r)
	if !ok {
		return
	}
	if err := tenant.ImportStandaloneProfile(h.Cfg.TenantTemplateDir, p.SeedPath); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.Profiles.Update(r.Context(), p); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summarizeLauncherProfile(p))
}

func (h *Handler) handleApplyLauncherProfile(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "id")
	var body struct {
		LauncherProfileID string `json:"launcher_profile_id"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	body.LauncherProfileID = strings.TrimSpace(body.LauncherProfileID)
	if body.LauncherProfileID == "" {
		writeError(w, http.StatusBadRequest, "launcher_profile_id is required")
		return
	}
	backupDir, err := h.Provisioner.ApplyProfile(r.Context(), tenantID, body.LauncherProfileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "backup_dir": backupDir})
}

func (h *Handler) getLauncherProfile(w http.ResponseWriter, r *http.Request) (*store.LauncherProfile, bool) {
	id := chi.URLParam(r, "id")
	p, err := h.Profiles.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrLauncherProfileNotFound) {
			writeError(w, http.StatusNotFound, "profile not found")
			return nil, false
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return nil, false
	}
	return p, true
}

func summarizeLauncherProfile(p *store.LauncherProfile) map[string]any {
	return map[string]any{
		"id":          p.ID,
		"name":        p.Name,
		"slug":        p.Slug,
		"description": p.Description,
		"is_default":  p.IsDefault,
		"version":     p.Version,
		"seed_path":   p.SeedPath,
		"role_policy": p.RolePolicy(),
		"created_at":  p.CreatedAt,
		"updated_at":  p.UpdatedAt,
	}
}

var profileSlugInvalid = regexp.MustCompile(`[^a-z0-9-]+`)

func normalizeProfileSlug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = profileSlugInvalid.ReplaceAllString(s, "-")
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
		return "000000"
	}
	return hex.EncodeToString(b)
}
