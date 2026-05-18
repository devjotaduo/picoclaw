package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
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

	if h.Mailer != nil && h.Mailer.Enabled() {
		tenantName := id
		if t, terr := h.Tenants.Get(r.Context(), id); terr == nil && t != nil {
			tenantName = t.DisplayName
		}
		inviteURL := h.Mailer.AdminBaseURL() + "/accept-invite?token=" + token
		go h.Mailer.SendInviteEmail(req.Email, tenantName, string(req.Role), inviteURL, inv.ExpiresAt)
	} else {
		log.Printf("invite: mailer disabled, token must be delivered manually to %s", req.Email)
	}

	resp := map[string]any{"invite": inv, "token": token}
	if h.Mailer == nil || !h.Mailer.Enabled() {
		resp["warning"] = "SMTP not configured — share the invite token manually."
	} else {
		resp["info"] = "Invite email sent. Token included as a delivery fallback."
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "id")
	userIDStr := chi.URLParam(r, "userId")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	actor, _ := userFromContext(r.Context())
	if actor == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if actor.ID == userID {
		writeError(w, http.StatusBadRequest, "cannot remove yourself; transfer ownership first")
		return
	}
	if err := h.Memberships.Delete(r.Context(), userID, tenantID); err != nil {
		if errors.Is(err, store.ErrMembershipNotFound) {
			writeError(w, http.StatusNotFound, "membership not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	_ = h.Audit.Insert(r.Context(), &actor.ID, &tenantID, "tenant.member.remove", "user", userIDStr)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleListInvites(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	invites, err := h.Invites.ListForTenant(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": invites})
}

func (h *Handler) handleRevokeInvite(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	invIDStr := chi.URLParam(r, "invId")
	var invID int64
	if _, err := fmt.Sscanf(invIDStr, "%d", &invID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid invite id")
		return
	}
	if err := h.Invites.Delete(r.Context(), invID, id); err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	actor, _ := userFromContext(r.Context())
	var actorID *int64
	if actor != nil {
		actorID = &actor.ID
	}
	_ = h.Audit.Insert(r.Context(), actorID, &id, "tenant.invite.revoke", "invite", invIDStr)
	w.WriteHeader(http.StatusNoContent)
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
