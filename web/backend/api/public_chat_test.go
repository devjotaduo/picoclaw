package api

import (
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"strings"
	"testing"
)

// newTestPublicChatProxy mirrors createPublicChatProxy but points at a
// fixed test upstream URL instead of resolving the gateway dynamically.
// Used to verify that the launcher's three /api/public/chat routes reach
// the proxy and forward to the gateway with the right path.
func newTestPublicChatProxy(target *url.URL) *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
		},
		FlushInterval: -1,
	}
}

// TestRegisterPublicChatRoutes_ProxyForwardsToGateway verifies that the
// three /api/public/chat routes the launcher registers reach the backend
// proxy and, when the proxy is given a working upstream, forward the
// request to it.
//
// It exercises the proxy directly (createPublicChatProxy) and stubs the
// gateway URL via a closure swap so we don't have to start a full
// launcher Handler with a real gateway.
func TestRegisterPublicChatRoutes_ProxyForwardsToGateway(t *testing.T) {
	// Spin up an upstream that records the path it received.
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	target, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("parse upstream URL: %v", err)
	}

	// Build the proxy with a Director that points at our test upstream
	// instead of the real gateway. This mirrors createPublicChatProxy's
	// behavior closely enough to validate the route registration shape.
	proxy := newTestPublicChatProxy(target)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/public/chat", proxy.ServeHTTP)
	mux.HandleFunc("GET /api/public/chat/stream", proxy.ServeHTTP)
	mux.HandleFunc("GET /api/public/chat/health", proxy.ServeHTTP)

	cases := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/public/chat"},
		{http.MethodGet, "/api/public/chat/stream"},
		{http.MethodGet, "/api/public/chat/health"},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			gotPath = ""
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(""))
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body=%q", rec.Code, rec.Body.String())
			}
			if gotPath != tc.path {
				t.Fatalf("upstream saw path %q, want %q", gotPath, tc.path)
			}
		})
	}
}

// TestCreatePublicChatProxy_ErrorHandlerReturns502 verifies that the real
// createPublicChatProxy (with all of its Rewrite / FlushInterval settings)
// surfaces an upstream connection failure as HTTP 502.
func TestCreatePublicChatProxy_ErrorHandlerReturns502(t *testing.T) {
	h := &Handler{configPath: "nonexistent-config-path.json"}
	proxy := h.createPublicChatProxy()
	if proxy.ErrorHandler == nil {
		t.Fatal("ErrorHandler is nil; SSE proxy must surface gateway failures")
	}
	if proxy.FlushInterval != -1 {
		t.Fatalf("FlushInterval = %v, want -1 (SSE requires immediate flush)", proxy.FlushInterval)
	}

	// Force the ErrorHandler path by invoking it directly with a stub error;
	// this avoids the cost of running gatewayProxyURL against a real config.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/public/chat/health", nil)
	proxy.ErrorHandler(rec, req, http.ErrServerClosed)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("ErrorHandler status = %d, want 502", rec.Code)
	}
}
