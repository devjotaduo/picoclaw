package jotaduowa

import (
	"context"
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

type fakeWhatsApp struct {
	running bool
	paired  bool
	result  SendResult
	err     error
	to      string
	text    string
}

func (f *fakeWhatsApp) IsRunning() bool { return f.running }
func (f *fakeWhatsApp) IsPaired() bool  { return f.paired }
func (f *fakeWhatsApp) Send(_ context.Context, to, text string) (SendResult, error) {
	f.to = to
	f.text = text
	return f.result, f.err
}
func (f *fakeWhatsApp) HealthHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
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

func TestHandleSendRegistersResolvedRouteAliases(t *testing.T) {
	r, err := OpenRouting(t.TempDir())
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = r.Close() })

	wa := &fakeWhatsApp{
		running: true,
		paired:  true,
		result: SendResult{
			MessageIDs:   []string{"mid-1"},
			RouteAliases: []string{"5511999998888@s.whatsapp.net", "39213068222606@lid"},
		},
	}
	s := NewServer(ServerConfig{
		HMACSecret: testHMACSecret,
		AdminToken: "admin-token",
		WhatsApp:   wa,
		Routing:    r,
	})

	body, err := json.Marshal(sendRequest{
		TenantID:  "tenant-public",
		To:        "+5511999998888",
		Text:      "Oi, teste real",
		Timestamp: time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("marshal send request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/internal/wa/send", strings.NewReader(string(body)))
	req.Header.Set(hmacSigHeader, signHMAC(body))
	w := httptest.NewRecorder()

	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("send: expected 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	if wa.to != "+5511999998888" || wa.text != "Oi, teste real" {
		t.Fatalf("unexpected send call: to=%q text=%q", wa.to, wa.text)
	}
	for _, jid := range []string{
		"5511999998888",
		"5511999998888@s.whatsapp.net",
		"39213068222606",
		"39213068222606@lid",
	} {
		got, err := r.Lookup(req.Context(), jid)
		if err != nil {
			t.Fatalf("Lookup(%s): %v", jid, err)
		}
		if got != "tenant-public" {
			t.Fatalf("Lookup(%s) = %q, want tenant-public", jid, got)
		}
	}
}

func TestAdminAuthFlow(t *testing.T) {
	// GET /pair without auth → login form (200, but loginHTML, not pairHTML).
	t.Run("no auth → login form served", func(t *testing.T) {
		s, _ := newTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/pair", nil)
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("login form: expected 200, got %d", w.Code)
		}
		body := w.Body.String()
		if !strings.Contains(body, `action="/pair/login"`) {
			t.Errorf("expected login form with action=\"/pair/login\"; got body=%q", body)
		}
		if !strings.Contains(body, `name="token"`) {
			t.Errorf("expected login form with token input; got body=%q", body)
		}
	})

	// /pair/qr without auth → 401 (the real protected endpoint).
	t.Run("no auth on /pair/qr → 401", func(t *testing.T) {
		s, _ := newTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/pair/qr", nil)
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 on /pair/qr, got %d", w.Code)
		}
	})

	// Wrong token via POST /pair/login → 401.
	t.Run("POST /pair/login wrong token → 401", func(t *testing.T) {
		s, _ := newTestServer(t)
		req := httptest.NewRequest(http.MethodPost, "/pair/login",
			strings.NewReader("token=wrong"))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	// Right token via POST /pair/login → 303 redirect + Set-Cookie.
	// Then GET /pair with the cookie → 200 pairHTML.
	t.Run("login flow: POST → cookie → GET /pair → pair UI", func(t *testing.T) {
		s, _ := newTestServer(t)
		req := httptest.NewRequest(http.MethodPost, "/pair/login",
			strings.NewReader("token=admin-token"))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		if w.Code != http.StatusSeeOther {
			t.Fatalf("login: expected 303, got %d (body=%s)", w.Code, w.Body.String())
		}

		// Extract the session cookie.
		var sessionCookie *http.Cookie
		for _, c := range w.Result().Cookies() {
			if c.Name == adminSessionCookie {
				sessionCookie = c
				break
			}
		}
		if sessionCookie == nil {
			t.Fatal("expected Set-Cookie for adminSessionCookie")
		}
		if !sessionCookie.HttpOnly {
			t.Error("session cookie must be HttpOnly")
		}
		if sessionCookie.SameSite != http.SameSiteStrictMode {
			t.Error("session cookie must be SameSite=Strict")
		}

		// Now use the cookie to access /pair (should serve pairHTML).
		req = httptest.NewRequest(http.MethodGet, "/pair", nil)
		req.AddCookie(sessionCookie)
		w = httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("/pair with cookie: expected 200, got %d", w.Code)
		}
		body := w.Body.String()
		if !strings.Contains(body, `id="qr"`) {
			t.Errorf("expected pair UI (QR div) when cookie valid; got body=%q", body)
		}
		if strings.Contains(body, `name="token"`) {
			t.Error("expected pair UI, got login form (cookie was not accepted)")
		}

		// /pair/qr with the cookie should ALSO succeed through the auth gate.
		// The default test server has no WhatsApp instance, so the downstream
		// handler returns 503; TestAdminAuthFlow is about AUTH only.
	})

	// ?token= query string fallback → MUST be rejected (audit P0).
	t.Run("query-string ?token= no longer authenticates", func(t *testing.T) {
		s, _ := newTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/pair/qr?token=admin-token", nil)
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("?token= must NOT authenticate (security fix): got %d", w.Code)
		}
	})

	// Header still works (for curl / scripts).
	t.Run("header still authenticates /pair/qr", func(t *testing.T) {
		s, _ := newTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/pair/qr", nil)
		req.Header.Set(adminTokenHeader, "admin-token")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, req)
		if w.Code == http.StatusUnauthorized {
			t.Error("header auth should succeed")
		}
	})
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
