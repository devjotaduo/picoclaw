package api

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/gatewayauth"
	"github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

func (h *Handler) withTenantGateway(admin http.Handler) http.Handler {
	h.adminRoutes = admin
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sub, ok := h.tenantSubdomain(r.Host)
		if !ok {
			admin.ServeHTTP(w, r)
			return
		}
		h.serveTenantHost(w, r, sub)
	})
}

func (h *Handler) tenantSubdomain(hostport string) (string, bool) {
	base := strings.Trim(strings.ToLower(h.Cfg.TenantBaseDomain), ".")
	if base == "" {
		return "", false
	}
	host := strings.ToLower(hostport)
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = strings.ToLower(h)
	}
	host = strings.Trim(host, ".")
	if host == base || host == "admin."+base || host == "adm."+base {
		return "", false
	}
	suffix := "." + base
	if !strings.HasSuffix(host, suffix) {
		return "", false
	}
	sub := strings.TrimSuffix(host, suffix)
	if sub == "" || strings.Contains(sub, ".") {
		return "", false
	}
	return sub, true
}

func (h *Handler) serveTenantHost(w http.ResponseWriter, r *http.Request, subdomain string) {
	t, err := h.Tenants.GetBySubdomain(r.Context(), subdomain)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			http.NotFound(w, r)
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if t.Status != store.StatusActive {
		writeError(w, http.StatusServiceUnavailable, "tenant is not active")
		return
	}

	target, _ := url.Parse(fmt.Sprintf("http://tenant-%s:18800", t.ID))
	if isPublicTenantRoute(r.Method, r.URL.Path) {
		h.proxyTenantRequest(w, r, target, nil)
		return
	}

	user, role, ok := h.authenticateTenantRequest(w, r, t.ID)
	if !ok {
		return
	}

	if r.URL.Path == "/api/auth/status" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "initialized": true})
		return
	}
	if r.URL.Path == "/api/auth/logout" && r.Method == http.MethodPost {
		h.clearSessionCookie(w, r)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/v1/tenants/me/") && h.adminRoutes != nil {
		rewritten := r.Clone(r.Context())
		rewritten.URL.Path = "/api/v1/tenants/" + t.ID + strings.TrimPrefix(r.URL.Path, "/api/v1/tenants/me")
		h.adminRoutes.ServeHTTP(w, rewritten)
		return
	}
	if r.URL.Path == "/launcher-login" || r.URL.Path == "/launcher-setup" {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	rolePolicy := policy.DefaultRolePolicy()
	if launcherPolicy, err := policy.LoadFile(t.VolumePath); err == nil {
		rolePolicy = launcherPolicy.RolePolicy
	}
	if !tenantDashboardAllowed(role, rolePolicy, r.Method, r.URL.Path) {
		writeError(w, http.StatusForbidden, "tenant role does not allow this action")
		return
	}

	h.proxyTenantRequest(w, r, target, func(req *http.Request) {
		gatewayauth.AnnotateRequest(req, h.Cfg.GatewaySharedSecret, gatewayauth.Claims{
			TenantID:  t.ID,
			UserID:    strconv.FormatInt(user.ID, 10),
			UserEmail: user.Email,
			Role:      role,
		}, time.Now())
	})
}

func (h *Handler) proxyTenantRequest(w http.ResponseWriter, r *http.Request, target *url.URL, annotate func(*http.Request)) {
	proxy := httputil.NewSingleHostReverseProxy(target)
	origDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		origDirector(req)
		req.Host = target.Host
		req.Header.Set("X-Forwarded-Host", r.Host)
		req.Header.Set("X-Forwarded-Proto", forwardedProto(r))
		if annotate != nil {
			annotate(req)
		}
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		writeError(w, http.StatusBadGateway, "tenant gateway error: "+err.Error())
	}
	proxy.ServeHTTP(w, r)
}

func (h *Handler) authenticateTenantRequest(w http.ResponseWriter, r *http.Request, tenantID string) (*store.User, string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		rejectTenantGatewayAuth(w, r, h.Cfg.TenantBaseDomain)
		return nil, "", false
	}
	user, err := h.Sessions.GetUser(r.Context(), cookie.Value)
	if err != nil || user.Status != store.UserStatusActive {
		rejectTenantGatewayAuth(w, r, h.Cfg.TenantBaseDomain)
		return nil, "", false
	}
	if user.IsPlatformAdmin() {
		return user, policy.RolePlatformAdmin, true
	}
	role, err := h.Memberships.GetRole(r.Context(), user.ID, tenantID)
	if err != nil {
		rejectTenantGatewayAuth(w, r, h.Cfg.TenantBaseDomain)
		return nil, "", false
	}
	return user, string(role), true
}

func tenantDashboardAllowed(role string, rolePolicy policy.RolePolicy, method, path string) bool {
	feature, required, known := policy.FeatureForRequest(method, path)
	if !known {
		return true
	}
	return policy.Allowed(role, rolePolicy, feature, required)
}

func isPublicTenantRoute(method, rawPath string) bool {
	if isPublicTenantStatic(method, rawPath) {
		return true
	}
	if method != http.MethodGet && method != http.MethodHead {
		return false
	}
	p := path.Clean("/" + strings.TrimPrefix(rawPath, "/"))
	return p == "/launcher-login" || p == "/launcher-setup"
}

func isPublicTenantStatic(method, rawPath string) bool {
	if method != http.MethodGet && method != http.MethodHead {
		return false
	}
	p := path.Clean("/" + strings.TrimPrefix(rawPath, "/"))
	if strings.HasPrefix(p, "/assets/") {
		return true
	}
	switch p {
	case "/apple-touch-icon.png",
		"/favicon-96x96.png",
		"/favicon.ico",
		"/favicon.svg",
		"/lark.svg",
		"/logo_with_text.png",
		"/logo_with_text_dark.png",
		"/logo_with_text_light.png",
		"/robots.txt",
		"/site.webmanifest",
		"/web-app-manifest-192x192.png",
		"/web-app-manifest-512x512.png":
		return true
	default:
		return false
	}
}

func rejectTenantGatewayAuth(w http.ResponseWriter, r *http.Request, baseDomain string) {
	p := path.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
	if strings.HasPrefix(p, "/api/") || p == "/pico/ws" || strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	target := "/login"
	if baseDomain != "" {
		target = "https://adm." + strings.Trim(baseDomain, ".") + "/login"
	}
	http.Redirect(w, r, target, http.StatusFound)
}

func forwardedProto(r *http.Request) string {
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		return proto
	}
	if r.TLS != nil {
		return "https"
	}
	return "http"
}
