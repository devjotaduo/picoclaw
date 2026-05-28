package api

import "testing"

func TestValidatePromoteRequestRequiresForceReason(t *testing.T) {
	err := validatePromoteRequest(promoteTenantRequest{Force: true})
	if err == nil {
		t.Fatal("validatePromoteRequest(force=true) err = nil, want missing force_reason error")
	}
}

func TestValidatePromoteRequestAcceptsForceReason(t *testing.T) {
	err := validatePromoteRequest(promoteTenantRequest{
		Force:       true,
		ForceReason: "cliente pediu liberacao manual apos contato telefonico",
	})
	if err != nil {
		t.Fatalf("validatePromoteRequest(force=true with reason) err = %v, want nil", err)
	}
}
