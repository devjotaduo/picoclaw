package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
)

func TestTenantSubdomainWithPort(t *testing.T) {
	h := &Handler{Cfg: &config.Config{TenantBaseDomain: "jotaduo.com"}}
	cases := []struct {
		hostport string
		wantSub  string
		wantOK   bool
	}{
		{"carlao.jotaduo.com:443", "carlao", true},
		{"carlao.jotaduo.com:80", "carlao", true},
		{"sub.carlao.jotaduo.com", "", false}, // nested subdomain blocked
		{"", "", false},                       // empty host
		{"other.example.com", "", false},      // different domain
		{"jotaduo.com.evil.com", "", false},   // suffix trap
	}
	for _, tc := range cases {
		sub, ok := h.tenantSubdomain(tc.hostport)
		if ok != tc.wantOK || sub != tc.wantSub {
			t.Errorf("tenantSubdomain(%q) = %q,%v; want %q,%v",
				tc.hostport, sub, ok, tc.wantSub, tc.wantOK)
		}
	}
}

func TestTenantSubdomainCaseInsensitive(t *testing.T) {
	h := &Handler{Cfg: &config.Config{TenantBaseDomain: "JOTADUO.COM"}}
	sub, ok := h.tenantSubdomain("CARLAO.JOTADUO.COM")
	if !ok || sub != "carlao" {
		t.Errorf("tenantSubdomain with mixed case: got %q,%v; want carlao,true", sub, ok)
	}
}

func TestTenantSubdomainEmptyBaseDomain(t *testing.T) {
	h := &Handler{Cfg: &config.Config{TenantBaseDomain: ""}}
	if _, ok := h.tenantSubdomain("anything.example.com"); ok {
		t.Fatal("empty base domain must return false")
	}
}

func TestForwardedProto(t *testing.T) {
	// Explicit header takes precedence
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("X-Forwarded-Proto", "https")
	if got := forwardedProto(r); got != "https" {
		t.Errorf("explicit header: got %q, want https", got)
	}

	// No header, no TLS → http
	r2 := httptest.NewRequest(http.MethodGet, "/", nil)
	if got := forwardedProto(r2); got != "http" {
		t.Errorf("no header, no TLS: got %q, want http", got)
	}
}

func TestRejectTenantGatewayAuthAPIPathsReturn401(t *testing.T) {
	cases := []struct {
		desc       string
		path       string
		upgrade    string
		wantStatus int
	}{
		{"API path", "/api/config", "", http.StatusUnauthorized},
		{"nested API path", "/api/channels/status", "", http.StatusUnauthorized},
		{"pico ws path", "/pico/ws", "", http.StatusUnauthorized},
		{"page path", "/", "", http.StatusFound},
		{"dashboard page", "/dashboard", "", http.StatusFound},
		{"Upgrade websocket header on any path", "/any-page", "websocket", http.StatusUnauthorized},
		{"Upgrade case-insensitive", "/page", "WebSocket", http.StatusUnauthorized},
	}
	for _, tc := range cases {
		t.Run(tc.desc, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "https://carlao.jotaduo.com"+tc.path, nil)
			if tc.upgrade != "" {
				req.Header.Set("Upgrade", tc.upgrade)
			}
			rec := httptest.NewRecorder()
			rejectTenantGatewayAuth(rec, req, "jotaduo.com")
			if rec.Code != tc.wantStatus {
				t.Errorf("path=%q upgrade=%q: status=%d, want %d",
					tc.path, tc.upgrade, rec.Code, tc.wantStatus)
			}
		})
	}
}

// Reject redirects to /launcher-login on the SAME host regardless of
// baseDomain. The baseDomain arg is no longer used (kept for log context
// only — bouncing the user to adm.<base>/login was the old behavior).
// `?next=` carries the original URI when present, so the launcher can
// return the user where they were trying to go after a successful login.
func TestRejectTenantGatewayAuthRedirectCases(t *testing.T) {
	cases := []struct {
		desc       string
		baseDomain string
		requestURI string
		wantLoc    string
	}{
		{
			desc:       "preserves ?next= for the original path",
			baseDomain: "jotaduo.com",
			requestURI: "/dashboard",
			wantLoc:    "/launcher-login?next=%2Fdashboard",
		},
		{
			desc:       "baseDomain ignored — never sends to adm.<base>",
			baseDomain: "jotaduo.com",
			requestURI: "/agents/clara",
			wantLoc:    "/launcher-login?next=%2Fagents%2Fclara",
		},
		{
			desc:       "empty baseDomain still redirects to launcher-login",
			baseDomain: "",
			requestURI: "/",
			wantLoc:    "/launcher-login?next=%2F",
		},
		{
			desc:       "already on /launcher-login: no ?next= loop",
			baseDomain: "jotaduo.com",
			requestURI: "/launcher-login",
			wantLoc:    "/launcher-login",
		},
	}
	for _, tc := range cases {
		t.Run(tc.desc, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.requestURI, nil)
			rec := httptest.NewRecorder()
			rejectTenantGatewayAuth(rec, req, tc.baseDomain)
			if rec.Code != http.StatusFound {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
			}
			if got := rec.Header().Get("Location"); got != tc.wantLoc {
				t.Fatalf("Location = %q, want %q", got, tc.wantLoc)
			}
		})
	}
}

func TestIsPublicTenantStaticAllFiles(t *testing.T) {
	publicFiles := []string{
		"/apple-touch-icon.png",
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
		"/web-app-manifest-512x512.png",
	}
	for _, p := range publicFiles {
		if !isPublicTenantStatic(http.MethodGet, p) {
			t.Errorf("GET %s should be public static", p)
		}
		if !isPublicTenantStatic(http.MethodHead, p) {
			t.Errorf("HEAD %s should be public static", p)
		}
		if isPublicTenantStatic(http.MethodPost, p) {
			t.Errorf("POST %s should not be public static", p)
		}
	}
}

func TestIsPublicTenantStaticAssetsPrefix(t *testing.T) {
	if !isPublicTenantStatic(http.MethodGet, "/assets/app.js") {
		t.Error("GET /assets/* should be public")
	}
	if isPublicTenantStatic(http.MethodPost, "/assets/app.js") {
		t.Error("POST /assets/* should not be public")
	}
	// Path traversal attempt: /assets/../api/config → cleaned to /api/config
	if isPublicTenantStatic(http.MethodGet, "/assets/../api/config") {
		t.Error("path traversal via assets/ must not be public")
	}
}

// TestIsPublicChatRoute verifies the path matcher used by serveTenantHost to
// decide whether a request on a public-onboarding tenant is eligible to skip
// Supabase JWT verification. The matcher must:
//   - accept the three canonical endpoints (chat, chat/stream, chat/health),
//   - accept any deeper /api/public/chat/* path,
//   - reject every other path even when it looks superficially "public",
//   - resist path-traversal attacks that would otherwise escape /api/public/chat.
//
// Note: this helper alone is not the full bypass — serveTenantHost also requires
// tenant.IsPublic=true. We test the path-matching logic in isolation here.
func TestIsPublicChatRoute(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		// Canonical accepted endpoints.
		{"/api/public/chat", true},
		{"/api/public/chat/stream", true},
		{"/api/public/chat/health", true},
		// Deeper paths under /api/public/chat/ are also accepted (room for
		// future endpoints like /chat/history, /chat/typing, etc.).
		{"/api/public/chat/anything", true},
		{"/api/public/chat/nested/deep", true},
		// Adjacent paths under /api/public must NOT be accepted — only chat.
		{"/api/public", false},
		{"/api/public/", false},
		{"/api/public/other", false},
		{"/api/public/admin", false},
		// Sibling/superficially similar names must not match.
		{"/api/public/chats", false},    // plural
		{"/api/public/chatting", false}, // prefix-only
		{"/api/publicchat", false},      // no slash separator
		// Anything outside /api/public is private.
		{"/api/agent/status", false},
		{"/api/config", false},
		{"/", false},
		{"/launcher-login", false},
		// Path traversal must be neutralized by path.Clean.
		{"/api/public/chat/../config", false},
		{"/api/public/chat/../../api/config", false},
		// Empty / leading slash variants — exercises the TrimPrefix+Clean step.
		{"api/public/chat", true},
		{"//api/public/chat", true},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			if got := isPublicChatRoute(tc.path); got != tc.want {
				t.Errorf("isPublicChatRoute(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}

// TestIsPublicChatHealthRoute confirms only the canonical health probe
// matches — chat / chat/stream pay the per-IP cap, while /health stays
// uncounted so load-balancer probes don't burn the budget. Path traversal
// attempts that would otherwise smuggle in /health are normalized by
// path.Clean before the comparison.
func TestIsPublicChatHealthRoute(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api/public/chat/health", true},
		{"/api/public/chat/health/", true},
		{"/api/public/chat", false},
		{"/api/public/chat/stream", false},
		{"/api/public/chat/health/extra", false},
		{"/api/public/chat/../chat/health", true},
		{"/api/public/chat/health/../stream", false},
		{"/health", false},
		{"/", false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.path, func(t *testing.T) {
			if got := isPublicChatHealthRoute(tc.path); got != tc.want {
				t.Errorf("isPublicChatHealthRoute(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}
