package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

const sessionCookieName = "picoclaw_saas_session"

type ctxKey int

const (
	ctxUserKey ctxKey = iota + 1
	ctxTenantRoleKey
)

func userFromContext(ctx context.Context) (*store.User, bool) {
	u, ok := ctx.Value(ctxUserKey).(*store.User)
	return u, ok && u != nil
}

func tenantRoleFromContext(ctx context.Context) (store.TenantRole, bool) {
	role, ok := ctx.Value(ctxTenantRoleKey).(store.TenantRole)
	return role, ok
}

func (h *Handler) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || strings.TrimSpace(cookie.Value) == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		user, err := h.Sessions.GetUser(r.Context(), cookie.Value)
		if err != nil || user.Status != store.UserStatusActive {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (h *Handler) requirePlatformAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := userFromContext(r.Context())
		if !ok || !user.IsPlatformAdmin() {
			writeError(w, http.StatusForbidden, "platform_admin required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) requireTenantRole(min store.TenantRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := userFromContext(r.Context())
			if !ok {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if user.IsPlatformAdmin() {
				ctx := context.WithValue(r.Context(), ctxTenantRoleKey, store.RoleTenantOwner)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			tenantID := chi.URLParam(r, "id")
			if tenantID == "" {
				writeError(w, http.StatusBadRequest, "tenant id required")
				return
			}
			role, err := h.Memberships.GetRole(r.Context(), user.ID, tenantID)
			if err != nil {
				if errors.Is(err, store.ErrMembershipNotFound) {
					writeError(w, http.StatusForbidden, "tenant access required")
					return
				}
				writeError(w, http.StatusInternalServerError, "db error")
				return
			}
			if !tenantRoleAllows(role, min) {
				writeError(w, http.StatusForbidden, string(min)+" required")
				return
			}
			ctx := context.WithValue(r.Context(), ctxTenantRoleKey, role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func tenantRoleAllows(role, min store.TenantRole) bool {
	rank := map[store.TenantRole]int{
		store.RoleViewer:      10,
		store.RoleOperator:    20,
		store.RoleTenantAdmin: 30,
		store.RoleTenantOwner: 40,
	}
	return rank[role] >= rank[min]
}

func (h *Handler) sessionCookieSameSite() http.SameSite {
	// With a cookie domain set (e.g. .jotaduo.com in prod), the launcher SPA
	// running on a tenant subdomain calls the controlplane via fetch and the
	// browser needs SameSite=None + Secure to forward the cookie. Without a
	// cookie domain (dev) Lax is fine and avoids the Secure requirement.
	if h.Cfg.CookieDomain != "" && h.Cfg.CookieSecure {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}

func (h *Handler) setSessionCookie(w http.ResponseWriter, token string) {
	c := &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Cfg.CookieSecure,
		SameSite: h.sessionCookieSameSite(),
		MaxAge:   int(h.Cfg.SessionTTL.Seconds()),
	}
	if h.Cfg.CookieDomain != "" {
		c.Domain = "." + h.Cfg.CookieDomain
	}
	http.SetCookie(w, c)
}

func (h *Handler) clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		_ = h.Sessions.Revoke(r.Context(), c.Value)
	}
	c := &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Cfg.CookieSecure,
		SameSite: h.sessionCookieSameSite(),
		MaxAge:   -1,
	}
	if h.Cfg.CookieDomain != "" {
		c.Domain = "." + h.Cfg.CookieDomain
	}
	http.SetCookie(w, c)
}
