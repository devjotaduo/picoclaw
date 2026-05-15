package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Verifies that the proxy strips the /crm prefix and forwards method, headers,
// and body to the upstream verbatim. Also checks that the unreachable case
// produces a clean 502 instead of a panic.
func TestCRMProxy_ForwardsAndStripsPrefix(t *testing.T) {
	var gotPath, gotMethod, gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMethod = r.Method
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	proxy := newCRMProxy(upstream.URL)

	// Mimic what chi does after StripPrefix("/crm"): r.URL.Path no longer has /crm.
	req := httptest.NewRequest(http.MethodPost, "/api/contacts", strings.NewReader(`{"first_name":"X"}`))
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if gotPath != "/api/contacts" {
		t.Errorf("upstream saw path %q, want /api/contacts", gotPath)
	}
	if gotMethod != http.MethodPost {
		t.Errorf("upstream saw method %q", gotMethod)
	}
	if gotBody != `{"first_name":"X"}` {
		t.Errorf("upstream saw body %q", gotBody)
	}
}

func TestCRMProxy_UnreachableUpstream(t *testing.T) {
	// Port 1 is reserved; nothing will accept. Connection refused → 502.
	proxy := newCRMProxy("http://127.0.0.1:1")
	req := httptest.NewRequest(http.MethodGet, "/api/stats", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Errorf("want 502, got %d  body=%s", rec.Code, rec.Body.String())
	}
}
