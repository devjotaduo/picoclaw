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

	// Tenant-scoped login page. Served BY the controlplane (not the launcher)
	// because the launcher in trusted_gateway mode doesn't authenticate users
	// itself — the controlplane has to. The page POSTs directly to Supabase
	// from the browser, sets the project-scoped cookie on .<baseDomain>, then
	// redirects to the `next` URL. See serveTenantLogin for the HTML.
	if r.Method == http.MethodGet && path.Clean("/"+strings.TrimPrefix(r.URL.Path, "/")) == "/login" {
		if h.SupabaseConfigured() && t.SupabaseUserID != nil && *t.SupabaseUserID != "" {
			h.serveTenantLogin(w, r, t)
			return
		}
		// Tenant doesn't use Supabase auth — fall through to launcher (it
		// has its own /launcher-login that the legacy local-auth path uses).
	}

	if isPublicTenantRoute(r.Method, r.URL.Path) {
		h.proxyTenantRequest(w, r, target, nil)
		return
	}

	// Magic link click: /m/<token> → validate, set cookie, redirect. Handled
	// BEFORE auth so visitors arriving via a shared link don't bounce off
	// the dashboard login page.
	if h.consumeMagicLink(w, r, t) {
		return
	}

	// Magic link visitor: if the browser has a valid magic cookie for THIS
	// tenant, proxy the request as an anonymous visitor (role=public). No
	// dashboard login, no Supabase JWT. Operator-issued and time-bounded by
	// the token's expiry, so revoking access is "rotate the gateway secret
	// + recreate tenant" — there's no per-link revoke list yet.
	if claims, ok := h.magicLinkClaimsFromCookie(r, t); ok {
		h.proxyTenantRequest(w, r, target, func(req *http.Request) {
			h.signMagicVisitorRequest(req, t, claims)
		})
		return
	}

	// Public-onboarding tenants accept anonymous traffic on a tiny set of chat
	// endpoints. Skip Supabase JWT but still sign trusted_gateway HMAC so the
	// launcher knows the request came from the controlplane. Sentinel values
	// are used for UserID/Role because the launcher's VerifyRequest rejects
	// empty claims; the agent identifies the visitor via session id.
	if t.IsPublic && isPublicChatRoute(r.URL.Path) {
		// Anonymous + open-internet route — apply the per-IP cap before we
		// burn LiteLLM budget on a flood. Health checks pass through
		// uncounted so probes / load balancers stay cheap.
		if h.PublicChatRateLimit != nil && !isPublicChatHealthRoute(r.URL.Path) {
			if !h.PublicChatRateLimit.Allow(clientIP(r)) {
				writeError(w, http.StatusTooManyRequests, "muitas mensagens, tenta de novo em um minuto")
				return
			}
		}
		h.proxyTenantRequest(w, r, target, func(req *http.Request) {
			gatewayauth.AnnotateRequest(req, h.Cfg.GatewaySharedSecret, gatewayauth.Claims{
				TenantID: t.ID,
				// Anonymous visitors don't have a Supabase user; the launcher's
				// VerifyRequest rejects empty UserID/Role, so we sign with sentinels.
				// The "public" role is recognized by the public-chat handlers only;
				// it grants no privileges on regular dashboard routes (which never
				// hit this code path — they go through authenticateTenantRequest).
				UserID: "anonymous",
				Role:   "public",
			}, time.Now())
		})
		return
	}

	userID, userEmail, role, ok := h.authenticateTenantRequest(w, r, t)
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
			UserID:    userID,
			UserEmail: userEmail,
			Role:      role,
		}, time.Now())
	})
}

func (h *Handler) proxyTenantRequest(
	w http.ResponseWriter,
	r *http.Request,
	target *url.URL,
	annotate func(*http.Request),
) {
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

// authenticateTenantRequest resolves who is making this request and what
// their role is on this tenant. Returns canonical (userID, email, role)
// strings ready to be signed into the trusted_gateway header.
//
// Tenants with auth_backend='supabase' are gated by the Supabase JWT in the
// sb-access-token cookie; the JWT's app_metadata.tenant_id must match the
// tenant being accessed. Tenants with auth_backend='local' (the historical
// path) keep using the controlplane's session cookie.
func (h *Handler) authenticateTenantRequest(
	w http.ResponseWriter,
	r *http.Request,
	t *store.Tenant,
) (string, string, string, bool) {
	if t.AuthBackend == "supabase" && h.Supabase != nil {
		return h.authenticateSupabaseTenant(w, r, t)
	}
	return h.authenticateLocalTenant(w, r, t.ID)
}

func (h *Handler) authenticateLocalTenant(
	w http.ResponseWriter,
	r *http.Request,
	tenantID string,
) (string, string, string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		rejectTenantGatewayAuth(w, r, h.Cfg.TenantBaseDomain)
		return "", "", "", false
	}
	user, err := h.Sessions.GetUser(r.Context(), cookie.Value)
	if err != nil || user.Status != store.UserStatusActive {
		rejectTenantGatewayAuth(w, r, h.Cfg.TenantBaseDomain)
		return "", "", "", false
	}
	if user.IsPlatformAdmin() {
		return strconv.FormatInt(user.ID, 10), user.Email, policy.RolePlatformAdmin, true
	}
	role, err := h.Memberships.GetRole(r.Context(), user.ID, tenantID)
	if err != nil {
		rejectTenantGatewayAuth(w, r, h.Cfg.TenantBaseDomain)
		return "", "", "", false
	}
	return strconv.FormatInt(user.ID, 10), user.Email, string(role), true
}

func (h *Handler) authenticateSupabaseTenant(
	w http.ResponseWriter,
	r *http.Request,
	t *store.Tenant,
) (string, string, string, bool) {
	token := readSupabaseAccessToken(r, h.Cfg.SupabaseProjectRef)
	if token == "" {
		rejectSupabaseTenantAuth(w, r, h.Supabase.SiteURL())
		return "", "", "", false
	}
	claims, err := h.Supabase.VerifyAccessToken(token)
	if err != nil {
		rejectSupabaseTenantAuth(w, r, h.Supabase.SiteURL())
		return "", "", "", false
	}
	if claims.TenantID != t.ID {
		writeError(w, http.StatusForbidden, "this account is not registered for this tenant")
		return "", "", "", false
	}
	// First successful owner auth: mark the tenant engaged and cancel any
	// pending onboarding reminders. initial_password_delivered is reused
	// as the "owner has shown up" flag for Supabase tenants (the original
	// local-auth meaning doesn't apply since we skip the bcrypt seed).
	// This block is cheap (one tenant column read above) and idempotent.
	if !t.InitialPasswordDelivered && mapSupabaseRoleToTenantRole(claims.Role) == string(store.RoleTenantOwner) {
		bgCtx := r.Context()
		if err := h.Tenants.MarkPasswordDelivered(bgCtx, t.ID); err == nil && h.Reminders != nil {
			_, _ = h.Reminders.CancelByTenant(bgCtx, t.ID, "owner first auth")
		}
	}
	return claims.UserID, claims.Email, mapSupabaseRoleToTenantRole(claims.Role), true
}

// readSupabaseAccessToken extracts the access token from any cookie name
// Supabase SDKs write. Order: project-scoped (preferred), then legacy short
// name, then Authorization: Bearer header for tests / CLI clients.
func readSupabaseAccessToken(r *http.Request, projectRef string) string {
	if projectRef != "" {
		if c, err := r.Cookie("sb-" + projectRef + "-auth-token"); err == nil && c.Value != "" {
			return strings.TrimSpace(c.Value)
		}
	}
	if c, err := r.Cookie("sb-access-token"); err == nil && c.Value != "" {
		return strings.TrimSpace(c.Value)
	}
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[len("Bearer "):])
	}
	return ""
}

// mapSupabaseRoleToTenantRole turns the role we stored in app_metadata into a
// value the launcher's policy engine understands. Unknown roles default to
// viewer (safest).
func mapSupabaseRoleToTenantRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "owner":
		return string(store.RoleTenantOwner)
	case "admin":
		return string(store.RoleTenantAdmin)
	case "operator":
		return string(store.RoleOperator)
	default:
		return string(store.RoleViewer)
	}
}

// rejectSupabaseTenantAuth handles an unauthenticated tenant request when the
// tenant uses Supabase Auth. API/WebSocket get 401; HTML pages get a 302 to
// a tenant-scoped login page at /login on the SAME subdomain (NOT the apex
// Supabase site_url — that's the admin login, a separate user table).
//
// Why same-subdomain instead of apex:
//   - apex /login is the controlplane admin login (table `users`), which has
//     nothing to do with Supabase `auth.users`. Login there succeeds but
//     does not set the `sb-<projectRef>-auth-token` cookie this gateway
//     looks for, so the user just bounces back here on next request.
//   - same-subdomain /login serves a small HTML page (see serveTenantLogin)
//     that POSTs directly to Supabase auth, sets the right cookie scoped
//     to .<baseDomain>, then redirects to the original URL.
func rejectSupabaseTenantAuth(w http.ResponseWriter, r *http.Request, siteURL string) {
	p := path.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
	if strings.HasPrefix(p, "/api/") || p == "/pico/ws" || strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Always send the user to /login on the SAME host. siteURL is intentionally
	// ignored for the host portion; it stays apex-only for things like Supabase
	// magic-link redirects that we configure in the Supabase dashboard.
	_ = siteURL
	target := "/login"
	if r.URL != nil && r.URL.RequestURI() != "" {
		target += "?next=" + url.QueryEscape(r.URL.RequestURI())
	}
	http.Redirect(w, r, target, http.StatusFound)
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
	// /login is served BY the controlplane (see serveTenantLogin) before the
	// launcher proxy ever runs, so this branch is mostly defensive — but
	// listing it here keeps the predicate honest and unblocks the proxy path
	// if a future refactor stops short-circuiting the request.
	return p == "/launcher-login" || p == "/launcher-setup" || p == "/login"
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

// isPublicChatRoute returns true for the small set of paths a public-onboarding
// tenant exposes to anonymous visitors (no Supabase JWT). Anything else still
// goes through the normal authenticateTenantRequest path even on a public tenant.
func isPublicChatRoute(rawPath string) bool {
	p := path.Clean("/" + strings.TrimPrefix(rawPath, "/"))
	switch p {
	case "/api/public/chat",
		"/api/public/chat/stream",
		"/api/public/chat/health":
		return true
	}
	return strings.HasPrefix(p, "/api/public/chat/")
}

// isPublicChatHealthRoute returns true for the health-probe endpoint that
// load balancers / uptime monitors hit every few seconds. Excluded from
// the per-IP cap so a single watchdog doesn't exhaust the budget; the cap
// targets actual chat traffic (POST + SSE GET).
func isPublicChatHealthRoute(rawPath string) bool {
	return path.Clean("/"+strings.TrimPrefix(rawPath, "/")) == "/api/public/chat/health"
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
