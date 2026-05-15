package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type memberReq struct {
	Email string           `json:"email"`
	Role  store.TenantRole `json:"role"`
}

func (h *Handler) handleListMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	members, err := h.Memberships.ListForTenant(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": members})
}

func (h *Handler) handleUpsertMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req memberReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Email = store.NormalizeEmail(req.Email); req.Email == "" || !validTenantRole(req.Role) {
		writeError(w, http.StatusBadRequest, "email and valid role required")
		return
	}
	user, err := h.Users.EnsureInvited(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user error")
		return
	}
	if err := h.Memberships.Upsert(r.Context(), user.ID, id, req.Role); err != nil {
		writeError(w, http.StatusInternalServerError, "membership error")
		return
	}
	actor, _ := userFromContext(r.Context())
	var actorID *int64
	if actor != nil {
		actorID = &actor.ID
	}
	_ = h.Audit.Insert(r.Context(), actorID, &id, "tenant.member.upsert", "user", req.Email)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleCreateInvite(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req memberReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Email = store.NormalizeEmail(req.Email); req.Email == "" || !validTenantRole(req.Role) {
		writeError(w, http.StatusBadRequest, "email and valid role required")
		return
	}
	actor, _ := userFromContext(r.Context())
	if actor == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	inv, token, err := h.Invites.Create(r.Context(), id, req.Email, req.Role, actor.ID, 7*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invite error")
		return
	}
	_ = h.Audit.Insert(r.Context(), &actor.ID, &id, "tenant.invite.create", "invite", req.Email)
	writeJSON(w, http.StatusCreated, map[string]any{
		"invite":  inv,
		"token":   token,
		"warning": "Save/send this invite token now; it is not stored in plaintext.",
	})
}

func (h *Handler) handleListAudit(w http.ResponseWriter, r *http.Request) {
	logs, err := h.Audit.Recent(r.Context(), 100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"audit": logs})
}

func validTenantRole(role store.TenantRole) bool {
	switch role {
	case store.RoleTenantOwner, store.RoleTenantAdmin, store.RoleOperator, store.RoleViewer:
		return true
	default:
		return false
	}
}
