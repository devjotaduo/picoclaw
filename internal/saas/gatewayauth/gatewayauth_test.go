package gatewayauth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAnnotateAndVerifyRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/config?x=1", nil)
	claims := Claims{
		TenantID:  "tenant-1",
		UserID:    "42",
		UserEmail: "owner@example.com",
		Role:      "tenant_owner",
	}
	now := time.Unix(1000, 0)
	AnnotateRequest(req, "secret", claims, now)

	got, err := VerifyRequest(req, "secret", time.Minute, now)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got != claims {
		t.Fatalf("claims = %+v, want %+v", got, claims)
	}
}

func TestVerifyRequestRejectsWrongSecret(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	now := time.Unix(1000, 0)
	AnnotateRequest(req, "secret", Claims{TenantID: "t", UserID: "u", Role: "viewer"}, now)
	if _, err := VerifyRequest(req, "wrong", time.Minute, now); err == nil {
		t.Fatal("VerifyRequest accepted a signature made with a different secret")
	}
}

func TestVerifyRequestRejectsExpiredTimestamp(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	AnnotateRequest(req, "secret", Claims{TenantID: "t", UserID: "u", Role: "viewer"}, time.Unix(1000, 0))
	if _, err := VerifyRequest(req, "secret", time.Minute, time.Unix(1200, 0)); err == nil {
		t.Fatal("VerifyRequest accepted an expired timestamp")
	}
}

// TestVerifyRequest_AcceptsAnonymousSentinels proves the sentinel claims used
// for public-onboarding tenant bypass survive Sign -> AnnotateRequest ->
// VerifyRequest. The controlplane signs anonymous public tenant traffic with
// UserID="anonymous" and Role="public" because the verifier rejects empty
// UserID/Role; if these sentinels ever stopped round-tripping, /pico/ws would
// 401 at the launcher.
func TestVerifyRequest_AcceptsAnonymousSentinels(t *testing.T) {
	secret := "test-secret-1234567890"
	now := time.Now()

	req := httptest.NewRequest(http.MethodGet, "https://onboarding.example.com/pico/ws", nil)

	AnnotateRequest(req, secret, Claims{
		TenantID: "t-onboarding",
		UserID:   "anonymous",
		Role:     "public",
	}, now)

	got, err := VerifyRequest(req, secret, 5*time.Minute, now)
	if err != nil {
		t.Fatalf("VerifyRequest rejected anonymous sentinels: %v", err)
	}
	if got.TenantID != "t-onboarding" {
		t.Errorf("TenantID: got %q want %q", got.TenantID, "t-onboarding")
	}
	if got.UserID != "anonymous" {
		t.Errorf("UserID: got %q want anonymous", got.UserID)
	}
	if got.Role != "public" {
		t.Errorf("Role: got %q want public", got.Role)
	}
}
