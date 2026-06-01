package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeTenantSubdomainAcceptsHealthyAuthStatus(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != tenantReadinessProbePath {
			t.Fatalf("path = %q, want %q", r.URL.Path, tenantReadinessProbePath)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	status, err := probeTenantSubdomain(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("probeTenantSubdomain returned error: %v", err)
	}
	if status != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", status, http.StatusNoContent)
	}
}

func TestProbeTenantSubdomainRejectsGatewayError(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	status, err := probeTenantSubdomain(context.Background(), srv.URL)
	if err == nil {
		t.Fatal("probeTenantSubdomain returned nil error")
	}
	if status != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", status, http.StatusBadGateway)
	}
}
