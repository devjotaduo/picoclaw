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
