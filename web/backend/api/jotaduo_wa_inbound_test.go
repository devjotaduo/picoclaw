package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

const testInboundSecret = "test-inbound-secret"

func signInbound(body []byte) string {
	mac := hmac.New(sha256.New, []byte(testInboundSecret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func newInboundBody(t *testing.T, mutate func(*jotaduoWAInboundBody)) []byte {
	t.Helper()
	b := jotaduoWAInboundBody{
		TenantID:  "test-tenant",
		FromPhone: "5511999998888",
		FromName:  "Pedro",
		Content:   "Oi Catarina, posso amanhã 10h",
		Timestamp: 1715000000,
		SentAt:    time.Now().Unix(),
	}
	if mutate != nil {
		mutate(&b)
	}
	out, err := json.Marshal(b)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return out
}

func TestJotaduoWAInbound_HappyPath(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	t.Cleanup(cleanup)
	t.Setenv("JOTADUO_WA_HMAC_SECRET", testInboundSecret)
	t.Setenv("PICOCLAW_TENANT_ID", "test-tenant")

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.registerJotaduoWAInboundRoutes(mux)

	body := newInboundBody(t, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/launcher/jotaduo-wa-inbound", bytes.NewReader(body))
	req.Header.Set(jotaduoWAInboundSigHeader, signInbound(body))
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", w.Code, w.Body.String())
	}

	// Verify the body landed in the inbox JSONL verbatim.
	inboxPath := filepath.Join(os.Getenv("PICOCLAW_HOME"), jotaduoWAInbox)
	got, err := os.ReadFile(inboxPath)
	if err != nil {
		t.Fatalf("read inbox: %v", err)
	}
	// The file should have exactly one line = the body + "\n".
	if !bytes.Equal(bytes.TrimRight(got, "\n"), body) {
		t.Errorf("inbox content mismatch.\nwant: %s\ngot:  %s", body, got)
	}
}

func TestJotaduoWAInbound_RejectsMissingSecret(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	t.Cleanup(cleanup)
	// Explicitly DO NOT set JOTADUO_WA_HMAC_SECRET → simulates cliente tenant.
	t.Setenv("JOTADUO_WA_HMAC_SECRET", "")

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.registerJotaduoWAInboundRoutes(mux)

	body := newInboundBody(t, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/launcher/jotaduo-wa-inbound", bytes.NewReader(body))
	req.Header.Set(jotaduoWAInboundSigHeader, signInbound(body))
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503 (cliente tenant should reject)", w.Code)
	}
}

func TestJotaduoWAInbound_RejectsBadSignature(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	t.Cleanup(cleanup)
	t.Setenv("JOTADUO_WA_HMAC_SECRET", testInboundSecret)

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.registerJotaduoWAInboundRoutes(mux)

	body := newInboundBody(t, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/launcher/jotaduo-wa-inbound", bytes.NewReader(body))
	req.Header.Set(jotaduoWAInboundSigHeader, "deadbeef")
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestJotaduoWAInbound_RejectsStaleTimestamp(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	t.Cleanup(cleanup)
	t.Setenv("JOTADUO_WA_HMAC_SECRET", testInboundSecret)

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.registerJotaduoWAInboundRoutes(mux)

	stale := time.Now().Add(-1 * time.Hour).Unix()
	body := newInboundBody(t, func(b *jotaduoWAInboundBody) {
		b.SentAt = stale
	})
	req := httptest.NewRequest(http.MethodPost, "/api/launcher/jotaduo-wa-inbound", bytes.NewReader(body))
	req.Header.Set(jotaduoWAInboundSigHeader, signInbound(body))
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 (body=%s)", w.Code, w.Body.String())
	}
}

func TestJotaduoWAInbound_RejectsTenantIDMismatch(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	t.Cleanup(cleanup)
	t.Setenv("JOTADUO_WA_HMAC_SECRET", testInboundSecret)
	t.Setenv("PICOCLAW_TENANT_ID", "this-tenant")

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.registerJotaduoWAInboundRoutes(mux)

	body := newInboundBody(t, func(b *jotaduoWAInboundBody) {
		b.TenantID = "OTHER-tenant" // sidecar misrouted
	})
	req := httptest.NewRequest(http.MethodPost, "/api/launcher/jotaduo-wa-inbound", bytes.NewReader(body))
	req.Header.Set(jotaduoWAInboundSigHeader, signInbound(body))
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 (tenant mismatch should fail closed)", w.Code)
	}
}

func TestJotaduoWAInbound_AppendsMultipleLines(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	t.Cleanup(cleanup)
	t.Setenv("JOTADUO_WA_HMAC_SECRET", testInboundSecret)
	t.Setenv("PICOCLAW_TENANT_ID", "test-tenant")

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.registerJotaduoWAInboundRoutes(mux)

	for i := 0; i < 3; i++ {
		body := newInboundBody(t, func(b *jotaduoWAInboundBody) {
			b.MessageID = "msg-" + strconv.Itoa(i)
			b.Content = "mensagem " + strconv.Itoa(i)
		})
		req := httptest.NewRequest(http.MethodPost, "/api/launcher/jotaduo-wa-inbound", bytes.NewReader(body))
		req.Header.Set(jotaduoWAInboundSigHeader, signInbound(body))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("iter %d: status = %d", i, w.Code)
		}
	}

	inboxPath := filepath.Join(os.Getenv("PICOCLAW_HOME"), jotaduoWAInbox)
	got, err := os.ReadFile(inboxPath)
	if err != nil {
		t.Fatalf("read inbox: %v", err)
	}
	lines := strings.Count(strings.TrimRight(string(got), "\n"), "\n") + 1
	if lines != 3 {
		t.Errorf("expected 3 lines in inbox, got %d", lines)
	}
}
