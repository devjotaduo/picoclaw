package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// tenantTypeResponse is the JSON shape the admin panel consumes for the v2.0
// tenant type catalog. Mirrors store.TenantType with snake_case tags.
type tenantTypeResponse struct {
	Slug               string          `json:"slug"`
	DisplayName        string          `json:"display_name"`
	Description        string          `json:"description"`
	Icon               string          `json:"icon"`
	Category           string          `json:"category"`
	UIProfile          string          `json:"ui_profile"`
	DefaultWorkspaceID string          `json:"default_workspace_id,omitempty"`
	Roster             json.RawMessage `json:"roster,omitempty"`
	Defaults           json.RawMessage `json:"defaults,omitempty"`
	IsSystem           bool            `json:"is_system"`
	IsSelectable       bool            `json:"is_selectable"`
	SortOrder          int             `json:"sort_order"`
}

func toTenantTypeResponse(t *store.TenantType) tenantTypeResponse {
	return tenantTypeResponse{
		Slug:               t.Slug,
		DisplayName:        t.DisplayName,
		Description:        t.Description,
		Icon:               t.Icon,
		Category:           t.Category,
		UIProfile:          t.UIProfile,
		DefaultWorkspaceID: t.DefaultWorkspaceID,
		Roster:             t.RosterJSON,
		Defaults:           t.DefaultsJSON,
		IsSystem:           t.IsSystem,
		IsSelectable:       t.IsSelectable,
		SortOrder:          t.SortOrder,
	}
}

// handleListTenantTypes returns the catalog. ?selectable=true restricts to the
// types the create wizard should offer.
func (h *Handler) handleListTenantTypes(w http.ResponseWriter, r *http.Request) {
	selectableOnly := r.URL.Query().Get("selectable") == "true"
	rows, err := h.TenantTypes.List(r.Context(), selectableOnly)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	out := make([]tenantTypeResponse, 0, len(rows))
	for _, t := range rows {
		out = append(out, toTenantTypeResponse(t))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tenant_types": out})
}

func (h *Handler) handleGetTenantType(w http.ResponseWriter, r *http.Request) {
	t, err := h.TenantTypes.Get(r.Context(), chi.URLParam(r, "slug"))
	if errors.Is(err, store.ErrTenantTypeNotFound) {
		writeError(w, http.StatusNotFound, "tipo de tenant não encontrado")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, toTenantTypeResponse(t))
}

type upsertTenantTypeReq struct {
	Slug               string          `json:"slug"`
	DisplayName        string          `json:"display_name"`
	Description        string          `json:"description"`
	Icon               string          `json:"icon"`
	Category           string          `json:"category"`
	UIProfile          string          `json:"ui_profile"`
	DefaultWorkspaceID string          `json:"default_workspace_id"`
	Roster             json.RawMessage `json:"roster"`
	Defaults           json.RawMessage `json:"defaults"`
	IsSelectable       *bool           `json:"is_selectable"`
	SortOrder          int             `json:"sort_order"`
}

// handleUpsertTenantType creates (POST /tenant-types) or edits
// (PUT /tenant-types/{slug}) a catalog entry. The route param wins over the
// body slug so PUT can't rename a row out from under itself.
func (h *Handler) handleUpsertTenantType(w http.ResponseWriter, r *http.Request) {
	var req upsertTenantTypeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if s := chi.URLParam(r, "slug"); s != "" {
		req.Slug = s
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	if req.Slug == "" || strings.TrimSpace(req.DisplayName) == "" {
		writeError(w, http.StatusBadRequest, "slug e display_name são obrigatórios")
		return
	}
	if strings.TrimSpace(req.UIProfile) == "" {
		req.UIProfile = "tenant"
	}
	if _, err := uiProfileFromCatalog(req.UIProfile); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.Category) == "" {
		req.Category = "cliente"
	}
	selectable := true
	if req.IsSelectable != nil {
		selectable = *req.IsSelectable
	}
	t := &store.TenantType{
		Slug:               req.Slug,
		DisplayName:        strings.TrimSpace(req.DisplayName),
		Description:        req.Description,
		Icon:               req.Icon,
		Category:           strings.ToLower(strings.TrimSpace(req.Category)),
		UIProfile:          strings.ToLower(strings.TrimSpace(req.UIProfile)),
		DefaultWorkspaceID: strings.TrimSpace(req.DefaultWorkspaceID),
		RosterJSON:         req.Roster,
		DefaultsJSON:       req.Defaults,
		IsSelectable:       selectable,
		SortOrder:          req.SortOrder,
	}
	if err := h.TenantTypes.Upsert(r.Context(), t); err != nil {
		writeError(w, http.StatusInternalServerError, "erro ao salvar tipo de tenant")
		return
	}
	writeJSON(w, http.StatusOK, toTenantTypeResponse(t))
}

// handleDeleteTenantType removes a non-system catalog entry. System types
// (publico/admin/cliente) are protected by the store and surface as 404.
func (h *Handler) handleDeleteTenantType(w http.ResponseWriter, r *http.Request) {
	err := h.TenantTypes.Delete(r.Context(), chi.URLParam(r, "slug"))
	if errors.Is(err, store.ErrTenantTypeNotFound) {
		writeError(w, http.StatusNotFound, "tipo de tenant não encontrado ou protegido (system)")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
