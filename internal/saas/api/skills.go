package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sipeed/picoclaw/internal/saas/skills"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// skillsFor builds a per-request Manager pinned to the tenant's workspace.
// It also returns the tenant id (already URL-validated by ValidateName).
func (h *Handler) skillsFor(w http.ResponseWriter, r *http.Request) (*skills.Manager, string, bool) {
	id := chi.URLParam(r, "id")
	if _, err := h.Tenants.Get(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
		} else {
			writeError(w, http.StatusInternalServerError, "db error")
		}
		return nil, "", false
	}
	return skills.New(h.Cfg.TenantHostDataDir, id), id, true
}

func skillNameParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	name := chi.URLParam(r, "name")
	if err := skills.ValidateName(name); err != nil {
		writeError(w, http.StatusBadRequest, "invalid skill name")
		return "", false
	}
	return name, true
}

func (h *Handler) handleListSkills(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	list, err := m.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"skills": list})
}

func (h *Handler) handleGetSkill(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	name, ok := skillNameParam(w, r)
	if !ok {
		return
	}
	s, err := m.Get(name)
	if err != nil {
		if errors.Is(err, skills.ErrNotFound) {
			writeError(w, http.StatusNotFound, "skill not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}

type saveSkillReq struct {
	Content string `json:"content"`
}

func (h *Handler) handleSaveSkill(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	name, ok := skillNameParam(w, r)
	if !ok {
		return
	}
	var req saveSkillReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := m.Save(name, req.Content); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type createSkillReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *Handler) handleCreateSkill(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	var req createSkillReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := skills.ValidateName(req.Name); err != nil {
		writeError(w, http.StatusBadRequest, "invalid skill name — use lowercase kebab-case")
		return
	}
	if err := m.Create(req.Name, req.Description); err != nil {
		if errors.Is(err, skills.ErrAlreadyExists) {
			writeError(w, http.StatusConflict, "skill already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s, err := m.Get(req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, s)
}

func (h *Handler) handleDeleteSkill(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	name, ok := skillNameParam(w, r)
	if !ok {
		return
	}
	if err := m.Delete(name); err != nil {
		if errors.Is(err, skills.ErrNotFound) {
			writeError(w, http.StatusNotFound, "skill not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type toggleReq struct {
	Active  *bool `json:"active,omitempty"`
	Visible *bool `json:"visible,omitempty"`
}

func (h *Handler) handleSetSkillActive(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	name, ok := skillNameParam(w, r)
	if !ok {
		return
	}
	var req toggleReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Active == nil {
		writeError(w, http.StatusBadRequest, "expected {\"active\": bool}")
		return
	}
	if err := m.SetActive(name, *req.Active); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	a, err := m.GetAgent()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

type saveAgentReq struct {
	Content string `json:"content"`
}

func (h *Handler) handleGetAgentInfo(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	info, err := m.GetAgentInfo()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *Handler) handleSaveAgentInfo(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	var req skills.AgentInfo
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := m.SetAgentInfo(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleSaveAgent(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	var req saveAgentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := m.SaveAgent(req.Content); err != nil {
		// Frontmatter validation errors are user errors — surface them as 400.
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleSetSkillVisible(w http.ResponseWriter, r *http.Request) {
	m, _, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	name, ok := skillNameParam(w, r)
	if !ok {
		return
	}
	var req toggleReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Visible == nil {
		writeError(w, http.StatusBadRequest, "expected {\"visible\": bool}")
		return
	}
	if err := m.SetVisible(name, *req.Visible); err != nil {
		if errors.Is(err, skills.ErrNotFound) {
			writeError(w, http.StatusNotFound, "skill not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
