package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type acceptInviteReq struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type changePasswordReq struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type loginAttempts struct {
	mu     sync.Mutex
	byIP   map[string][]time.Time
	limit  int
	window time.Duration
}

func newLoginAttempts() *loginAttempts {
	return &loginAttempts{
		byIP:   map[string][]time.Time{},
		limit:  20,
		window: 5 * time.Minute,
	}
}

func (l *loginAttempts) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-l.window)
	hist := l.byIP[ip]
	kept := hist[:0]
	for _, t := range hist {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.byIP[ip] = kept
		return false
	}
	kept = append(kept, now)
	l.byIP[ip] = kept
	return true
}

func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		if i := strings.IndexByte(xf, ','); i >= 0 {
			return strings.TrimSpace(xf[:i])
		}
		return strings.TrimSpace(xf)
	}
	if rip := r.Header.Get("X-Real-IP"); rip != "" {
		return rip
	}
	return r.RemoteAddr
}

func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !h.LoginAttempts.allow(ip) {
		writeError(w, http.StatusTooManyRequests, "too many attempts; try again later")
		return
	}

	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password required")
		return
	}

	user, err := h.Users.GetByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if user.Status != store.UserStatusActive || user.BcryptHash == nil || !auth.VerifyPassword(*user.BcryptHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	_ = h.Users.MarkLogin(r.Context(), user.ID)

	token, err := h.Sessions.Create(r.Context(), user.ID, h.Cfg.SessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session error")
		return
	}
	h.setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"email": user.Email})
}

func (h *Handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	h.clearSessionCookie(w, r)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleAcceptInvite(w http.ResponseWriter, r *http.Request) {
	var req acceptInviteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	req.Password = strings.TrimSpace(req.Password)
	if req.Token == "" || len([]rune(req.Password)) < 8 {
		writeError(w, http.StatusBadRequest, "token and password with at least 8 characters required")
		return
	}
	inv, err := h.Invites.GetOpenByToken(r.Context(), req.Token)
	if err != nil {
		if errors.Is(err, store.ErrInviteNotFound) {
			writeError(w, http.StatusUnauthorized, "invalid or expired invite")
			return
		}
		writeError(w, http.StatusInternalServerError, "invite error")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password error")
		return
	}
	user, err := h.Users.Activate(r.Context(), inv.Email, hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user error")
		return
	}
	if err := h.Memberships.Upsert(r.Context(), user.ID, inv.TenantID, inv.Role); err != nil {
		writeError(w, http.StatusInternalServerError, "membership error")
		return
	}
	_ = h.Invites.MarkAccepted(r.Context(), inv.ID)
	_ = h.Audit.Insert(r.Context(), &user.ID, &inv.TenantID, "tenant.invite.accept", "user", user.Email)
	token, err := h.Sessions.Create(r.Context(), user.ID, h.Cfg.SessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session error")
		return
	}
	h.setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"email": user.Email, "tenant_id": inv.TenantID, "role": inv.Role})
}

func (h *Handler) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := userFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ip := clientIP(r)
	if !h.LoginAttempts.allow(ip) {
		writeError(w, http.StatusTooManyRequests, "too many attempts; try again later")
		return
	}

	var req changePasswordReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.CurrentPassword = strings.TrimSpace(req.CurrentPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	if req.CurrentPassword == "" {
		writeError(w, http.StatusBadRequest, "current_password is required")
		return
	}
	if len([]rune(req.NewPassword)) < 8 {
		writeError(w, http.StatusBadRequest, "new_password must be at least 8 characters")
		return
	}
	if req.CurrentPassword == req.NewPassword {
		writeError(w, http.StatusBadRequest, "new password must differ from current password")
		return
	}

	fresh, err := h.Users.GetByID(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user lookup failed")
		return
	}
	if fresh.Status != store.UserStatusActive || fresh.BcryptHash == nil || !auth.VerifyPassword(*fresh.BcryptHash, req.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password hash failed")
		return
	}
	if err := h.Users.UpdatePassword(r.Context(), fresh.ID, hash); err != nil {
		writeError(w, http.StatusInternalServerError, "password update failed")
		return
	}
	_ = h.Audit.Insert(r.Context(), &fresh.ID, nil, "auth.password.change", "user", fresh.Email)

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := userFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	memberships, _ := h.Memberships.ListForUser(r.Context(), user.ID)
	if memberships == nil {
		memberships = []store.TenantMembership{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":            user.ID,
		"email":         user.Email,
		"status":        user.Status,
		"platform_role": user.PlatformRole,
		"memberships":   memberships,
		"capabilities":  capabilitiesFor(user, memberships),
		"created_at":    user.CreatedAt,
		"last_login":    user.LastLogin,
	})
}

func capabilitiesFor(user *store.User, memberships []store.TenantMembership) []string {
	if user.IsPlatformAdmin() {
		return []string{
			"platform:admin",
			"tenants:create",
			"tenants:lifecycle",
			"tenants:delete",
			"tenants:read:any",
			"crm:read",
			"crm:write",
			"audit:read",
		}
	}
	caps := map[string]bool{}
	for _, m := range memberships {
		caps["tenants:read"] = true
		switch m.Role {
		case store.RoleTenantOwner:
			caps["tenant:members:write"] = true
			caps["tenant:config:write"] = true
			caps["tenant:operator"] = true
		case store.RoleTenantAdmin:
			caps["tenant:config:write"] = true
			caps["tenant:operator"] = true
		case store.RoleOperator:
			caps["tenant:operator"] = true
		}
	}
	out := make([]string, 0, len(caps))
	for c := range caps {
		out = append(out, c)
	}
	sort.Strings(out)
	return out
}
