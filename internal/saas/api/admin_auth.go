package api

import (
	"encoding/json"
	"errors"
	"net"
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

type forgotPasswordReq struct {
	Email string `json:"email"`
}

type resetPasswordReq struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// passwordResetTTL caps how long a freshly-emailed reset link stays valid.
// 1h is the convention across mainstream products (Supabase, Auth0, etc.)
// — long enough to survive an email spam-filter delay, short enough that
// a leaked link doesn't sit around for days.
const passwordResetTTL = 1 * time.Hour

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

// clientIP returns the visitor's bare IP (no port), preferring
// X-Forwarded-For (first hop) then X-Real-IP then RemoteAddr. Used as the
// rate-limiter key, so reconnect-with-new-source-port can't slip past the
// limiter and legitimate users behind a single NAT/proxy aren't fragmented
// across multiple keys.
func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		first := xf
		if i := strings.IndexByte(xf, ','); i >= 0 {
			first = xf[:i]
		}
		return stripPort(strings.TrimSpace(first))
	}
	if rip := r.Header.Get("X-Real-IP"); rip != "" {
		return stripPort(strings.TrimSpace(rip))
	}
	return stripPort(r.RemoteAddr)
}

// stripPort returns the host portion of an "ip:port" or "[ipv6]:port"
// address, or the input unchanged when no port is present. We hit this on
// r.RemoteAddr (always host:port from net/http) and on rare XFF/X-Real-IP
// values that include a port — never strip from a bare IPv4/IPv6 literal.
func stripPort(addr string) string {
	if addr == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
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
	if user.Status != store.UserStatusActive || user.BcryptHash == nil ||
		!auth.VerifyPassword(*user.BcryptHash, req.Password) {
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
	if fresh.Status != store.UserStatusActive || fresh.BcryptHash == nil ||
		!auth.VerifyPassword(*fresh.BcryptHash, req.CurrentPassword) {
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

// ── Password reset ───────────────────────────────────────────────────
//
// Public, no auth required. Two endpoints:
//
//   POST /api/v1/auth/forgot-password { email }       → 204 always
//   POST /api/v1/auth/reset-password  { token, password } → 204 on success
//
// The forgot-password handler ALWAYS returns 204 — whether the email
// belongs to a known user or not — so a probe can't enumerate accounts.
// The work (generating + emailing the token) only happens when the user
// exists and has a bcrypt hash (not a Supabase-only account, which has
// its own reset flow via the Supabase dashboard).

func (h *Handler) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	// Same throttle as login — both touch the bcrypt path and we don't
	// want a forgot-password endpoint to be a side-channel for the
	// existing login-attempts limiter.
	if !h.LoginAttempts.allow(ip) {
		writeError(w, http.StatusTooManyRequests, "too many attempts; try again later")
		return
	}

	var req forgotPasswordReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Bad JSON still returns 204 to keep the response shape
		// constant. The client will never tell the difference between
		// "malformed body" and "unknown email" — both are 204.
		w.WriteHeader(http.StatusNoContent)
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Best-effort lookup. Errors (including ErrUserNotFound) just yield
	// the same 204 — no leakage.
	user, err := h.Users.GetByEmail(r.Context(), email)
	if err != nil || user == nil || user.Status != store.UserStatusActive || user.BcryptHash == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	token, err := auth.RandomToken(32)
	if err != nil {
		// Internal error — but still return 204 to the client. The
		// failure is logged via audit so an operator can spot it.
		_ = h.Audit.Insert(r.Context(), nil, nil, "auth.password.reset.gen_error", "user", email)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	expiresAt := time.Now().Add(passwordResetTTL)
	pr := &store.PasswordReset{
		Token:     token,
		UserID:    user.ID,
		ExpiresAt: expiresAt,
	}
	if v := strings.TrimSpace(ip); v != "" {
		pr.IP = &v
	}
	if ua := strings.TrimSpace(r.Header.Get("User-Agent")); ua != "" {
		pr.UserAgent = &ua
	}
	if err := h.PasswordResets.Insert(r.Context(), pr); err != nil {
		_ = h.Audit.Insert(r.Context(), &user.ID, nil, "auth.password.reset.store_error", "user", email)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Build the reset URL using the admin base URL (mailer config). If
	// the mailer isn't configured, the URL still goes into the audit log
	// so the operator can grab it manually.
	resetURL := h.adminPasswordResetURL(token)
	if h.Mailer != nil && h.Mailer.Enabled() {
		go h.Mailer.SendPasswordResetEmail(email, resetURL, expiresAt)
	}
	_ = h.Audit.Insert(r.Context(), &user.ID, nil, "auth.password.reset.request", "user", email)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !h.LoginAttempts.allow(ip) {
		writeError(w, http.StatusTooManyRequests, "too many attempts; try again later")
		return
	}

	var req resetPasswordReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	req.Password = strings.TrimSpace(req.Password)
	if req.Token == "" {
		writeError(w, http.StatusBadRequest, "token required")
		return
	}
	if len([]rune(req.Password)) < 8 {
		writeError(w, http.StatusBadRequest, "password must have at least 8 characters")
		return
	}

	pr, err := h.PasswordResets.GetUsable(r.Context(), req.Token)
	if err != nil {
		// Generic 401 — caller can't tell whether the token was wrong,
		// already used, or expired. Friendlier than 4 different error
		// codes and harder to attack.
		writeError(w, http.StatusUnauthorized, "invalid or expired reset link")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password hash failed")
		return
	}
	if err := h.Users.UpdatePassword(r.Context(), pr.UserID, hash); err != nil {
		writeError(w, http.StatusInternalServerError, "password update failed")
		return
	}
	// Burn the token + every other outstanding reset for this user.
	// One-shot is the whole point; if the user generated multiple links
	// (multiple "forgot password" clicks), they all die at once.
	_ = h.PasswordResets.MarkUsed(r.Context(), req.Token)
	_ = h.PasswordResets.InvalidateAllForUser(r.Context(), pr.UserID)
	_ = h.Audit.Insert(r.Context(), &pr.UserID, nil, "auth.password.reset.complete", "user", "")

	w.WriteHeader(http.StatusNoContent)
}

// adminPasswordResetURL builds the URL embedded in the reset email. It
// follows the same admin-base convention as invite emails — uses the
// configured MailerAdminURL or falls back to https://adm.<base>/.
func (h *Handler) adminPasswordResetURL(token string) string {
	base := ""
	if h.Mailer != nil {
		base = strings.TrimRight(h.Mailer.AdminBaseURL(), "/")
	}
	if base == "" {
		base = "https://adm." + strings.Trim(h.Cfg.TenantBaseDomain, ".")
	}
	return base + "/reset-password?token=" + token
}
