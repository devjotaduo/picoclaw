package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

const testSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

// signOnboardingBody computes the hex HMAC-SHA256 of body with secret.
func signOnboardingBody(t *testing.T, body []byte, secret string) string {
	t.Helper()
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

// newCallbackHandler returns a *Handler suitable for handler-level tests.
// Pass nil for the store fields when you don't need DB access.
func newCallbackHandler(secret string) *Handler {
	cfg := &config.Config{OnboardingCallbackSecret: secret}
	return &Handler{Cfg: cfg}
}

func doCallback(t *testing.T, h *Handler, body []byte, sig string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/onboarding-callback", bytes.NewReader(body))
	if sig != "" {
		req.Header.Set(onboardingCallbackSigHeader, sig)
	}
	rec := httptest.NewRecorder()
	h.handleOnboardingCallback(rec, req)
	return rec
}

// --- HMAC unit tests (no handler) ---

func TestVerifyOnboardingHMAC(t *testing.T) {
	t.Parallel()
	body := []byte(`{"intake_id":"ci_x","action":"mark_qualified","ts":1}`)
	good := signOnboardingBody(t, body, testSecret)

	t.Run("empty sig", func(t *testing.T) {
		if verifyOnboardingHMAC(body, "", testSecret) {
			t.Fatal("empty signature should not verify")
		}
	})
	t.Run("non-hex sig", func(t *testing.T) {
		if verifyOnboardingHMAC(body, "not-hex-zz", testSecret) {
			t.Fatal("non-hex signature should not verify")
		}
	})
	t.Run("mismatch", func(t *testing.T) {
		bad := signOnboardingBody(t, body, "wrong-secret")
		if verifyOnboardingHMAC(body, bad, testSecret) {
			t.Fatal("wrong-secret signature should not verify")
		}
	})
	t.Run("match", func(t *testing.T) {
		if !verifyOnboardingHMAC(body, good, testSecret) {
			t.Fatal("correct signature should verify")
		}
	})
}

// --- Handler tests that don't need DB ---

func TestOnboardingCallback_MissingSecret(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler("")
	rec := doCallback(t, h, []byte(`{}`), "anything")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestOnboardingCallback_MissingSignatureHeader(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler(testSecret)
	rec := doCallback(t, h, []byte(`{}`), "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestOnboardingCallback_BadSignature(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler(testSecret)
	body := []byte(`{"intake_id":"ci_x","action":"mark_qualified","ts":1}`)
	// sign with a different secret
	sig := signOnboardingBody(t, body, "different-secret")
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestOnboardingCallback_StaleTimestamp(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler(testSecret)
	// 10 minutes in the past — beyond 5min skew.
	stale := time.Now().Add(-10 * time.Minute).Unix()
	body := []byte(fmt.Sprintf(`{"intake_id":"ci_x","action":"mark_qualified","ts":%d}`, stale))
	sig := signOnboardingBody(t, body, testSecret)
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (stale ts)", rec.Code)
	}
}

func TestOnboardingCallback_FutureTimestamp(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler(testSecret)
	// 10 minutes in the future — beyond +5min skew.
	future := time.Now().Add(10 * time.Minute).Unix()
	body := []byte(fmt.Sprintf(`{"intake_id":"ci_x","action":"mark_qualified","ts":%d}`, future))
	sig := signOnboardingBody(t, body, testSecret)
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (future ts)", rec.Code)
	}
}

func TestOnboardingCallback_MissingIntakeID(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler(testSecret)
	body := []byte(fmt.Sprintf(`{"intake_id":"","action":"mark_qualified","ts":%d}`, time.Now().Unix()))
	sig := signOnboardingBody(t, body, testSecret)
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestOnboardingCallback_UnknownAction(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler(testSecret)
	body := []byte(fmt.Sprintf(`{"intake_id":"ci_x","action":"frobnicate","ts":%d}`, time.Now().Unix()))
	sig := signOnboardingBody(t, body, testSecret)
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (unknown action)", rec.Code)
	}
}

func TestOnboardingCallback_SubmitIntakeMissingEmail(t *testing.T) {
	t.Parallel()
	h := newCallbackHandler(testSecret)
	body := []byte(fmt.Sprintf(`{"intake_id":"ci_x","action":"submit_intake","ts":%d}`, time.Now().Unix()))
	sig := signOnboardingBody(t, body, testSecret)
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (missing contact_email)", rec.Code)
	}
}

// --- DB-backed handler tests (gated on TEST_DB_DSN) ---

// openCallbackTestDB mirrors the openTestDB helper from internal/saas/store
// since cross-package test helpers aren't shared. Skips when TEST_DB_DSN
// is unset.
func openCallbackTestDB(t *testing.T) *store.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DB_DSN")
	if dsn == "" {
		t.Skip("TEST_DB_DSN not set; skipping DB-backed callback tests")
	}
	db, err := store.Open(context.Background(), dsn)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatalf("db.Migrate: %v", err)
	}
	t.Cleanup(db.Close)
	return db
}

func TestOnboardingCallback_MarkQualifiedNotFound(t *testing.T) {
	db := openCallbackTestDB(t)
	h := newCallbackHandler(testSecret)
	h.CompanyIntakes = &store.CompanyIntakeStore{DB: db}

	body := []byte(fmt.Sprintf(`{"intake_id":"ci_does_not_exist_%d","action":"mark_qualified","ts":%d}`,
		time.Now().UnixNano(), time.Now().Unix()))
	sig := signOnboardingBody(t, body, testSecret)
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
	}
}

func TestOnboardingCallback_MarkQualifiedHappyPath(t *testing.T) {
	db := openCallbackTestDB(t)
	ctx := context.Background()
	intakes := &store.CompanyIntakeStore{DB: db}
	h := newCallbackHandler(testSecret)
	h.CompanyIntakes = intakes

	// Seed a draft intake.
	id, err := store.NewCompanyIntakeID()
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := store.NewCompanyIntakeResumeToken()
	tokenHash := store.CompanyIntakeTokenHash(raw)
	intake := &store.CompanyIntake{ID: id, Status: store.CompanyIntakeDraft}
	if err := intakes.Create(ctx, intake, tokenHash, "ip-hash", "ua"); err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	body, _ := json.Marshal(onboardingCallbackBody{
		IntakeID:  id,
		Action:    "mark_qualified",
		Timestamp: time.Now().Unix(),
	})
	sig := signOnboardingBody(t, body, testSecret)
	rec := doCallback(t, h, body, sig)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body=%s", rec.Code, rec.Body.String())
	}

	// Verify DB state.
	after, err := intakes.Get(ctx, id)
	if err != nil {
		t.Fatalf("get after callback: %v", err)
	}
	if after.QualifiedAt == nil {
		t.Fatal("QualifiedAt should be set after mark_qualified")
	}
}
