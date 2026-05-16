package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

func (h *Handler) handlePlatformStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.Usage.PlatformSummary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) handlePlatformTimeseries(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}
	pts, err := h.Usage.Timeseries(r.Context(), days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}
	if pts == nil {
		pts = []store.TimeseriesPoint{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"points": pts})
}

func (h *Handler) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.Users.ListAll(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	type userDTO struct {
		ID           int64      `json:"id"`
		Email        string     `json:"email"`
		Status       string     `json:"status"`
		PlatformRole string     `json:"platform_role"`
		CreatedAt    time.Time  `json:"created_at"`
		LastLogin    *time.Time `json:"last_login"`
	}
	out := make([]userDTO, 0, len(users))
	for _, u := range users {
		out = append(out, userDTO{
			ID:           u.ID,
			Email:        u.Email,
			Status:       string(u.Status),
			PlatformRole: string(u.PlatformRole),
			CreatedAt:    u.CreatedAt,
			LastLogin:    u.LastLogin,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

type inviteAdminReq struct {
	Email string `json:"email"`
}

func (h *Handler) handleInvitePlatformAdmin(w http.ResponseWriter, r *http.Request) {
	var req inviteAdminReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	email := store.NormalizeEmail(req.Email)
	if email == "" {
		writeError(w, http.StatusBadRequest, "email required")
		return
	}

	actor, _ := userFromContext(r.Context())
	var actorID int64
	if actor != nil {
		actorID = actor.ID
	}

	user, err := h.Users.EnsureInvited(r.Context(), email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user error: "+err.Error())
		return
	}

	// Create platform-level invite (tenant_id = "" treated as platform invite).
	// Reuse the existing invite mechanism; accept-invite flow handles activation.
	inv, token, err := h.Invites.Create(r.Context(), "", email, store.RoleTenantOwner, actorID, 7*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invite error: "+err.Error())
		return
	}
	_ = inv

	_ = h.Audit.Insert(r.Context(), &actorID, nil, "invite_platform_admin", "user", strconv.FormatInt(user.ID, 10))

	writeJSON(w, http.StatusOK, map[string]any{
		"token":      token,
		"email":      email,
		"expires_at": time.Now().Add(7 * 24 * time.Hour),
	})
}
