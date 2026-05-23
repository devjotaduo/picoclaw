package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/store"
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

func TestTenantProxyTargetDefaultsToDockerDNSName(t *testing.T) {
	h := &Handler{}
	target := h.tenantProxyTarget(context.Background(), &store.Tenant{ID: "acme-123"})
	if got, want := target.String(), "http://tenant-acme-123:18800"; got != want {
		t.Fatalf("tenantProxyTarget = %q, want %q", got, want)
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

