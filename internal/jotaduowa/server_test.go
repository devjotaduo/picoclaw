package jotaduowa

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

const testHMACSecret = "test-secret-do-not-use-in-prod"

func signHMAC(body []byte) string {
	mac := hmac.New(sha256.New, []byte(testHMACSecret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// newTestServer wires only the Routing piece so HMAC + routing endpoints can
// be exercised without a real WhatsApp connection. The /send path needs WA
// and is exercised by a separate integration-style test (skipped here).
func newTestServer(t *testing.T) (*Server, *Routing) {
	t.Helper()
	r, err := OpenRouting(t.TempDir())
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = r.Close() })
	return NewServer(ServerConfig{
		HMACSecret: testHMACSecret,
		AdminToken: "admin-token",
		Routing:    r,
	}), r
}

func TestHMACRejectsBadSignature(t *testing.T) {
	s, _ := newTestServer(t)
	body := []byte(`{"tenant_id":"t1","phone":"5511","ts":` + nowSec() + `}`)

	req := httptest.NewRequest(http.MethodPost, "/internal/wa/routing", strings.NewReader(string(body)))
	req.Header.Set(hmacSigHeader, "deadbeef") // wrong sig
	w := httptest.NewRecorder()

	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d (body=%s)", w.Code, w.Body.String())
	}
}

func TestHMACRejectsStaleTimestamp(t *testing.T) {
	s, _ := newTestServer(t)
	stale := time.Now().Add(-1 * time.Hour).Unix()
	body := []byte(`{"tenant_id":"t1","phone":"5511","ts":` + itoa(stale) + `}`)

	req := httptest.NewRequest(http.MethodPost, "/internal/wa/routing", strings.NewReader(string(body)))
	req.Header.Set(hmacSigHeader, signHMAC(body))
	w := httptest.NewRecorder()

	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d (body=%s)", w.Code, w.Body.String())
	}
}

func TestRoutingRegisterAndRevokeViaHTTP(t *testing.T) {
	s, store := newTestServer(t)

	// Register.
	body := []byte(`{"tenant_id":"tenant-x","phone":"5511999998888","ts":` + nowSec() + `}`)
	req := httptest.NewRequest(http.MethodPost, "/internal/wa/routing", strings.NewReader(string(body)))
	req.Header.Set(hmacSigHeader, signHMAC(body))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("register: expected 200, got %d (body=%s)", w.Code, w.Body.String())
	}

	// Confirm via store.
	got, err := store.Lookup(req.Context(), "5511999998888")
	if err != nil || got != "tenant-x" {
		t.Fatalf("store after register: got=%q err=%v", got, err)
	}

	// Revoke.
	body = []byte(`{}`) // body is unused for DELETE but still HMAC'd
	req = httptest.NewRequest(http.MethodDelete, "/internal/wa/routing/by-tenant/tenant-x", strings.NewReader(string(body)))
	req.Header.Set(hmacSigHeader, signHMAC(body))
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("revoke: expected 200, got %d (body=%s)", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode revoke resp: %v", err)
	}
	if n, _ := resp["routes_removed"].(float64); n != 1 {
		t.Errorf("expected routes_removed=1, got %v", resp["routes_removed"])
	}
	if got, _ := store.Lookup(req.Context(), "5511999998888"); got != "" {
		t.Errorf("expected route gone after revoke, got %q", got)
	}
}

func TestAdminTokenGatesPair(t *testing.T) {
	s, _ := newTestServer(t)

	// Without token → 401.
	req := httptest.NewRequest(http.MethodGet, "/pair", nil)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("no token: expected 401, got %d", w.Code)
	}

	// With wrong token → 401.
	req = httptest.NewRequest(http.MethodGet, "/pair", nil)
	req.Header.Set(adminTokenHeader, "wrong")
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("wrong token: expected 401, got %d", w.Code)
	}

	// Right token via header → 200.
	req = httptest.NewRequest(http.MethodGet, "/pair", nil)
	req.Header.Set(adminTokenHeader, "admin-token")
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("good token: expected 200, got %d", w.Code)
	}

	// Right token via query string → 200 (browser-friendly fallback).
	req = httptest.NewRequest(http.MethodGet, "/pair?token=admin-token", nil)
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("good token via query: expected 200, got %d", w.Code)
	}
}

func TestHealthzAlwaysOK(t *testing.T) {
	s, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("healthz: expected 200, got %d", w.Code)
	}
}

func itoa(i int64) string {
	return strconv.FormatInt(i, 10)
}

func nowSec() string {
	return itoa(time.Now().Unix())
}
