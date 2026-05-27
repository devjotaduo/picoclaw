package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
)

const testJotaduoWASecret = "revoke-test-secret"

func newRevokeHandler(cfg *config.Config) *Handler {
	return &Handler{Cfg: cfg}
}

func TestRevokeJotaduoWARouting_NoSecretIsNoop(t *testing.T) {
	// Pre-fatia-1 deployments don't have the sidecar configured. The
	// helper must return nil silently — promote shouldn't see a noisy
	// log about a service that doesn't exist.
	h := newRevokeHandler(&config.Config{
		JotaduoWAURL: "http://wherever",
		// JotaduoWAHMACSecret intentionally empty
	})
	if err := h.RevokeJotaduoWARouting(context.Background(), "tenant-x"); err != nil {
		t.Errorf("expected nil for unconfigured sidecar, got %v", err)
	}
}

func TestRevokeJotaduoWARouting_PartialConfigErrors(t *testing.T) {
	// Secret set but URL empty — likely a misconfigured deployment.
	// Fail loudly so the operator notices instead of silently dropping
	// revoke calls.
	h := newRevokeHandler(&config.Config{JotaduoWAHMACSecret: "x"})
	err := h.RevokeJotaduoWARouting(context.Background(), "tenant-x")
	if err == nil || !strings.Contains(err.Error(), "URL not configured") {
		t.Errorf("expected URL-missing error, got %v", err)
	}
}

func TestRevokeJotaduoWARouting_EmptyTenantErrors(t *testing.T) {
	h := newRevokeHandler(&config.Config{
		JotaduoWAURL:        "http://x",
		JotaduoWAHMACSecret: "y",
	})
	err := h.RevokeJotaduoWARouting(context.Background(), "  ")
	if err == nil || !strings.Contains(err.Error(), "tenant_id required") {
		t.Errorf("expected tenant_id error, got %v", err)
	}
}

func TestRevokeJotaduoWARouting_HappyPath(t *testing.T) {
	var (
		mu        sync.Mutex
		gotMethod string
		gotPath   string
		gotSig    string
		gotBody   []byte
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotSig = r.Header.Get("X-Jotaduo-Wa-Signature")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"tenant_id":"abc-123","routes_removed":2}`))
	}))
	t.Cleanup(srv.Close)

	h := newRevokeHandler(&config.Config{
		JotaduoWAURL:        srv.URL,
		JotaduoWAHMACSecret: testJotaduoWASecret,
	})

	if err := h.RevokeJotaduoWARouting(context.Background(), "abc-123"); err != nil {
		t.Fatalf("RevokeJotaduoWARouting: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if gotMethod != http.MethodDelete {
		t.Errorf("method = %q, want DELETE", gotMethod)
	}
	if gotPath != "/internal/wa/routing/by-tenant/abc-123" {
		t.Errorf("path = %q", gotPath)
	}
	// Signature must match what the sidecar verifies.
	mac := hmac.New(sha256.New, []byte(testJotaduoWASecret))
	_, _ = mac.Write(gotBody)
	want := hex.EncodeToString(mac.Sum(nil))
	if gotSig != want {
		t.Errorf("HMAC sig mismatch: got %q want %q", gotSig, want)
	}
}

func TestRevokeJotaduoWARouting_SidecarErrorIsReturned(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"sidecar boom"}`, http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	h := newRevokeHandler(&config.Config{
		JotaduoWAURL:        srv.URL,
		JotaduoWAHMACSecret: testJotaduoWASecret,
	})
	err := h.RevokeJotaduoWARouting(context.Background(), "tenant-x")
	if err == nil {
		t.Fatal("expected error from sidecar 500, got nil")
	}
	if !strings.Contains(err.Error(), "500") || !strings.Contains(err.Error(), "boom") {
		t.Errorf("error should surface status + body: got %v", err)
	}
}

func TestRevokeJotaduoWARouting_TenantIDIsURLEscaped(t *testing.T) {
	// Tenant ids are alphanumeric+hyphen today but the helper must keep
	// working if that ever loosens — and a non-escaped value with a slash
	// would let the caller hit a different sidecar route (silent path
	// confusion → security smell).
	var gotEscaped string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotEscaped = r.URL.EscapedPath()
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)
	h := newRevokeHandler(&config.Config{
		JotaduoWAURL:        srv.URL,
		JotaduoWAHMACSecret: testJotaduoWASecret,
	})
	if err := h.RevokeJotaduoWARouting(context.Background(), "weird/id"); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	const want = "/internal/wa/routing/by-tenant/weird%2Fid"
	if gotEscaped != want {
		t.Errorf("tenant id slash must be escaped:\n  want %q\n  got  %q", want, gotEscaped)
	}
}
