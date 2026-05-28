package middleware

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/gatewayauth"
	saasPolicy "github.com/sipeed/picoclaw/internal/saas/policy"
)

// LauncherDashboardCookieName is the HttpOnly cookie set after a successful password login.
const LauncherDashboardCookieName = "picoclaw_launcher_auth"

// launcherDashboardSessionMaxAgeSec is the dashboard session cookie lifetime (31 days).
const launcherDashboardSessionMaxAgeSec = 31 * 24 * 3600

const (
	launcherSessionCookieBytes = 32
	launcherGrantNonceBytes    = 32
	// LauncherDashboardLocalAutoLoginPath is the one-shot local browser
	// bootstrap endpoint used by the launcher-managed auto-open flow.
	LauncherDashboardLocalAutoLoginPath = "/launcher-auto-login"
	// LauncherDashboardSetupPath is the setup page used before the dashboard
	// password is initialized.
	LauncherDashboardSetupPath = "/launcher-setup"
)

type trustedGatewayClaimsContextKey struct{}

func TrustedGatewayClaims(r *http.Request) (gatewayauth.Claims, bool) {
	claims, ok := r.Context().Value(trustedGatewayClaimsContextKey{}).(gatewayauth.Claims)
	return claims, ok
}

// NewLauncherDashboardSessionCookie creates the per-process session cookie value.
func NewLauncherDashboardSessionCookie() (string, error) {
	return randomURLToken(launcherSessionCookieBytes)
}

func randomURLToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// LauncherDashboardAuthConfig holds runtime material for dashboard access checks.
type LauncherDashboardAuthConfig struct {
	ExpectedCookie string
	// AuthMode is "local" by default. "trusted_gateway" accepts only
	// HMAC-signed requests from the Picoclaw SaaS gateway for protected paths.
	AuthMode             string
	TrustedGatewaySecret string
	// LocalAutoLogin enables one-shot startup auto-login.
	LocalAutoLogin *LauncherDashboardLocalAutoLogin
	// SecureCookie sets the session cookie's Secure flag. If nil, DefaultLauncherDashboardSecureCookie is used.
	SecureCookie func(*http.Request) bool
	// InternalToken is a per-launcher-process random token that the launcher
	// exports via env (PICOCLAW_LAUNCHER_INTERNAL_TOKEN) so child processes
	// — primarily the gateway and its tools (e.g. notify_user posting to
	// /api/notifications) — can authenticate against the launcher's local
	// API without a dashboard cookie. Requests carrying the matching
	// X-Picoclaw-Internal-Token header bypass the cookie check. Empty
	// disables the feature.
	InternalToken string
	// AnonymousPublicDashboard lets public onboarding tenants serve the
	// visitor-facing chat shell without a dashboard cookie. Requests admitted
	// this way are annotated as role=public; PolicyMiddleware still enforces
	// the public role's feature limits.
	AnonymousPublicDashboard bool
}

// LauncherInternalTokenHeader is the request header name child processes
// send to authenticate against the launcher's internal API without a
// dashboard session cookie.
const LauncherInternalTokenHeader = "X-Picoclaw-Internal-Token"

// LauncherDashboardLocalAutoLogin is an in-memory, one-shot startup grant.
// It is not a reusable credential; it only lets the launcher-opened browser
// receive the current process session cookie.
type LauncherDashboardLocalAutoLogin struct {
	grant *launcherDashboardOneTimeGrant
}

type launcherDashboardOneTimeGrant struct {
	mu       sync.Mutex
	expires  time.Time
	consumed bool
	nonce    string
	now      func() time.Time
}

// NewLauncherDashboardLocalAutoLogin creates a one-shot local auto-login grant.
func NewLauncherDashboardLocalAutoLogin(ttl time.Duration) (*LauncherDashboardLocalAutoLogin, error) {
	grant, err := newLauncherDashboardOneTimeGrant(ttl)
	if err != nil {
		return nil, err
	}
	return &LauncherDashboardLocalAutoLogin{
		grant: grant,
	}, nil
}

// URLPath returns the one-shot local auto-login URL path including its nonce.
func (a *LauncherDashboardLocalAutoLogin) URLPath() string {
	return launcherGrantQueryPath(LauncherDashboardLocalAutoLoginPath, a.grant)
}

// DefaultLauncherDashboardSecureCookie mirrors typical production HTTPS detection (TLS or X-Forwarded-Proto).
func DefaultLauncherDashboardSecureCookie(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// SetLauncherDashboardSessionCookie writes the HttpOnly session cookie after successful dashboard password login.
func SetLauncherDashboardSessionCookie(
	w http.ResponseWriter,
	r *http.Request,
	sessionValue string,
	secure func(*http.Request) bool,
) {
	if secure == nil {
		secure = DefaultLauncherDashboardSecureCookie
	}
	http.SetCookie(w, &http.Cookie{
		Name:     LauncherDashboardCookieName,
		Value:    sessionValue,
		Path:     "/",
		MaxAge:   launcherDashboardSessionMaxAgeSec,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure(r),
	})
}

// ClearLauncherDashboardSessionCookie clears the dashboard session (e.g. logout).
func ClearLauncherDashboardSessionCookie(w http.ResponseWriter, r *http.Request, secure func(*http.Request) bool) {
	if secure == nil {
		secure = DefaultLauncherDashboardSecureCookie
	}
	http.SetCookie(w, &http.Cookie{
		Name:     LauncherDashboardCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure(r),
		Expires:  time.Unix(0, 0),
	})
}

// LauncherDashboardAuth requires a valid session cookie before calling next.
// Public paths are login/setup pages and /api/auth/* handlers.
//
// In local mode the launcher also accepts trusted-gateway HMAC headers as
// a SECONDARY credential when TrustedGatewaySecret is configured. This is
// what makes controlplane-issued magic links work on local-mode tenants:
// the controlplane signs the request with the shared HMAC secret, and the
// launcher honors it just like a normal session cookie. The local-cookie
// path is tried FIRST (so a real interactive owner's cookie always wins),
// HMAC is the fallback for the magic-link visitor flow.
func LauncherDashboardAuth(cfg LauncherDashboardAuthConfig, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := canonicalAuthPath(r.URL.Path)
		if isTrustedGatewayMode(cfg) {
			if isPublicLauncherDashboardStatic(r.Method, p) ||
				isPublicLauncherPublicChatHealth(r.Method, p) ||
				isPublicLauncherJotaduoWAInbound(r.Method, p) {
				next.ServeHTTP(w, r)
				return
			}
			if claims, ok := validTrustedGatewayAuth(r, cfg); ok {
				ctx := context.WithValue(r.Context(), trustedGatewayClaimsContextKey{}, claims)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			if cfg.AnonymousPublicDashboard && isAnonymousPublicDashboardPath(r.Method, p) {
				next.ServeHTTP(w, withAnonymousPublicClaims(r))
				return
			}
			rejectLauncherDashboardAuth(w, r, p)
			return
		}
		if p == LauncherDashboardLocalAutoLoginPath {
			handleLauncherLocalAutoLogin(w, r, cfg)
			return
		}
		if isPublicLauncherDashboardPath(r.Method, p) {
			// Public paths bypass the auth check, but if signed
			// trusted-gateway headers ARE present we still annotate the
			// context with the verified claims so handlers (notably
			// /api/auth/status) can short-circuit any "not initialized"
			// state for HMAC-authenticated callers. The local-cookie
			// case stays a no-op pass-through.
			if strings.TrimSpace(cfg.TrustedGatewaySecret) != "" {
				if claims, ok := validTrustedGatewayAuth(r, cfg); ok {
					ctx := context.WithValue(r.Context(), trustedGatewayClaimsContextKey{}, claims)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
			next.ServeHTTP(w, r)
			return
		}
		if validLauncherDashboardAuth(r, cfg) {
			next.ServeHTTP(w, r)
			return
		}
		// Internal-token fallback: child processes (gateway + its tools
		// like notify_user) authenticate by sending the launcher's
		// per-process token. Token only exists in this launcher's env;
		// child inherits via os.Environ() at spawn. Constant-time compare
		// to avoid timing leaks.
		if cfg.InternalToken != "" {
			if hdr := strings.TrimSpace(r.Header.Get(LauncherInternalTokenHeader)); hdr != "" {
				if subtle.ConstantTimeCompare([]byte(hdr), []byte(cfg.InternalToken)) == 1 {
					next.ServeHTTP(w, r)
					return
				}
			}
		}
		// Local-mode fallback: signed trusted-gateway headers from the
		// controlplane are accepted even without a session cookie. The
		// HMAC shared secret env (PICOCLAW_TRUSTED_GATEWAY_SECRET) ties
		// these to controlplane origin — same trust root used by the
		// trusted_gateway mode above. Magic-link visitors land here.
		if strings.TrimSpace(cfg.TrustedGatewaySecret) != "" {
			if claims, ok := validTrustedGatewayAuth(r, cfg); ok {
				ctx := context.WithValue(r.Context(), trustedGatewayClaimsContextKey{}, claims)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}
		if cfg.AnonymousPublicDashboard && isAnonymousPublicDashboardPath(r.Method, p) {
			next.ServeHTTP(w, withAnonymousPublicClaims(r))
			return
		}
		rejectLauncherDashboardAuth(w, r, p)
	})
}

func withAnonymousPublicClaims(r *http.Request) *http.Request {
	claims := gatewayauth.Claims{
		UserID: "anonymous",
		Role:   saasPolicy.RolePublic,
	}
	ctx := context.WithValue(r.Context(), trustedGatewayClaimsContextKey{}, claims)
	return r.WithContext(ctx)
}

func isAnonymousPublicDashboardPath(method, p string) bool {
	if isPublicLauncherDashboardStatic(method, p) {
		return true
	}
	if method == http.MethodGet && p == "/" {
		return true
	}
	if method == http.MethodGet && p == "/api/auth/status" {
		return true
	}
	if method == http.MethodGet && p == "/api/launcher/policy" {
		return true
	}
	if isAnonymousPublicChatPath(method, p) {
		return true
	}
	_, _, known := saasPolicy.FeatureForRequest(method, p)
	return known
}

func isAnonymousPublicChatPath(method, p string) bool {
	if method != http.MethodGet && method != http.MethodPost {
		return false
	}
	switch p {
	case "/api/public/chat", "/api/public/chat/stream", "/api/public/chat/health":
		return true
	default:
		return strings.HasPrefix(p, "/api/public/chat/")
	}
}

// canonicalAuthPath matches path cleaning used for routing decisions so
// prefixes like /assets/../ cannot bypass auth (CVE-class traversal).

func handleLauncherLocalAutoLogin(w http.ResponseWriter, r *http.Request, cfg LauncherDashboardAuthConfig) {
	if validLauncherDashboardAuth(r, cfg) {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte("method not allowed"))
		return
	}
	if r.Method == http.MethodHead {
		rejectLauncherDashboardAuth(w, r, LauncherDashboardLocalAutoLoginPath)
		return
	}
	if cfg.LocalAutoLogin != nil && cfg.LocalAutoLogin.consume(r.URL.Query().Get("nonce")) {
		SetLauncherDashboardSessionCookie(w, r, cfg.ExpectedCookie, cfg.SecureCookie)
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	rejectLauncherDashboardAuth(w, r, LauncherDashboardLocalAutoLoginPath)
}

func (a *LauncherDashboardLocalAutoLogin) consume(nonce string) bool {
	if a == nil || a.grant == nil {
		return false
	}
	return a.grant.use(nonce, nil) == nil
}

func newLauncherDashboardOneTimeGrant(ttl time.Duration) (*launcherDashboardOneTimeGrant, error) {
	nonce, err := randomURLToken(launcherGrantNonceBytes)
	if err != nil {
		return nil, err
	}
	return &launcherDashboardOneTimeGrant{
		expires: time.Now().Add(ttl),
		nonce:   nonce,
		now:     time.Now,
	}, nil
}

func launcherGrantQueryPath(basePath string, grant *launcherDashboardOneTimeGrant) string {
	if grant == nil {
		return basePath
	}
	return basePath + "?nonce=" + url.QueryEscape(grant.nonce)
}

// ErrInvalidLauncherDashboardGrant reports that an auto-login grant is missing,
// expired, already consumed, or otherwise invalid.
var ErrInvalidLauncherDashboardGrant = errors.New("invalid launcher dashboard grant")

func (g *launcherDashboardOneTimeGrant) use(nonce string, fn func() error) error {
	if g == nil {
		return ErrInvalidLauncherDashboardGrant
	}
	if len(nonce) != len(g.nonce) ||
		subtle.ConstantTimeCompare([]byte(nonce), []byte(g.nonce)) != 1 {
		return ErrInvalidLauncherDashboardGrant
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now
	if g.now != nil {
		now = g.now
	}
	if g.consumed || !now().Before(g.expires) {
		return ErrInvalidLauncherDashboardGrant
	}
	if fn != nil {
		if err := fn(); err != nil {
			return err
		}
	}
	g.consumed = true
	return nil
}

func canonicalAuthPath(raw string) string {
	if raw == "" {
		return "/"
	}
	c := path.Clean(raw)
	switch c {
	case ".", "":
		return "/"
	default:
		if c[0] != '/' {
			return "/" + c
		}
		return c
	}
}

func isPublicLauncherDashboardPath(method, p string) bool {
	if isPublicLauncherDashboardStatic(method, p) {
		return true
	}
	if isPublicLauncherPublicChatHealth(method, p) {
		return true
	}
	if isPublicLauncherJotaduoWAInbound(method, p) {
		return true
	}
	switch p {
	case "/api/auth/login":
		return method == http.MethodPost
	case "/api/auth/forgot-password":
		return method == http.MethodPost
	case "/api/auth/logout":
		return method == http.MethodPost
	case "/api/auth/status":
		return method == http.MethodGet
	case "/api/auth/setup":
		return method == http.MethodPost
	}
	return false
}

func isPublicLauncherPublicChatHealth(method, p string) bool {
	return method == http.MethodGet && p == "/api/public/chat/health"
}

func isPublicLauncherJotaduoWAInbound(method, p string) bool {
	return method == http.MethodPost && p == "/api/launcher/jotaduo-wa-inbound"
}

// isPublicLauncherDashboardStatic allows the SPA login route and embedded
// frontend assets without a session (GET/HEAD only).
func isPublicLauncherDashboardStatic(method, p string) bool {
	if method != http.MethodGet && method != http.MethodHead {
		return false
	}
	if p == "/launcher-login" || p == "/launcher-setup" {
		return true
	}
	if strings.HasPrefix(p, "/assets/") {
		return true
	}
	if strings.HasPrefix(p, "/public/marketing/") {
		return true
	}
	// Vite dev server module paths. The launcher reverse-proxies these to the
	// Vite dev server when PICOCLAW_VITE_DEV_URL is set (see web/backend/embed.go);
	// in production these prefixes don't exist on disk so allowing them only
	// affects the dev loop.
	if strings.HasPrefix(p, "/@vite/") ||
		strings.HasPrefix(p, "/@react-refresh") ||
		strings.HasPrefix(p, "/@fs/") ||
		strings.HasPrefix(p, "/@id/") ||
		strings.HasPrefix(p, "/src/") ||
		strings.HasPrefix(p, "/node_modules/") {
		return true
	}
	switch p {
	case "/favicon.ico", "/favicon.svg", "/favicon-96x96.png",
		"/apple-touch-icon.png", "/lark.svg",
		"/logo_with_text.png", "/logo_with_text_dark.png", "/logo_with_text_light.png",
		"/jota-duo-logo.png",
		"/robots.txt", "/site.webmanifest",
		"/web-app-manifest-192x192.png", "/web-app-manifest-512x512.png":
		return true
	default:
		return false
	}
}

func validLauncherDashboardAuth(r *http.Request, cfg LauncherDashboardAuthConfig) bool {
	if c, err := r.Cookie(LauncherDashboardCookieName); err == nil {
		if subtle.ConstantTimeCompare([]byte(c.Value), []byte(cfg.ExpectedCookie)) == 1 {
			return true
		}
	}
	return false
}

func isTrustedGatewayMode(cfg LauncherDashboardAuthConfig) bool {
	return strings.EqualFold(strings.TrimSpace(cfg.AuthMode), "trusted_gateway")
}

func validTrustedGatewayAuth(r *http.Request, cfg LauncherDashboardAuthConfig) (gatewayauth.Claims, bool) {
	claims, err := gatewayauth.VerifyRequest(r, cfg.TrustedGatewaySecret, 5*time.Minute, time.Now())
	return claims, err == nil
}

func rejectLauncherDashboardAuth(w http.ResponseWriter, r *http.Request, canonicalPath string) {
	if canonicalPath == "/pico/ws" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if strings.HasPrefix(canonicalPath, "/api/") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
		return
	}
	http.Redirect(w, r, "/launcher-login", http.StatusFound)
}
