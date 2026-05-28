package api

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

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

func TestMarkPromotedForPromoteFallsBackWhenDockerCLIUnavailable(t *testing.T) {
	t.Setenv("PATH", "")

	volumePath := t.TempDir()
	stateDir := filepath.Join(volumePath, "workspace", "state")
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	statePath := filepath.Join(stateDir, "onboarding.json")
	initial := []byte(`{
  "phase": "ready_for_promotion",
  "promotion": {
    "ready": true,
    "blocked_by": [],
    "promoted_at": null,
    "promoted_by": null
  }
}`)
	if err := os.WriteFile(statePath, initial, 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	markPromotedForPromote(context.Background(), "tenant-test", volumePath, "admin@example.com")

	updated, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(updated, &doc); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if doc["phase"] != "promoted" {
		t.Fatalf("phase = %v, want promoted", doc["phase"])
	}
	promo, ok := doc["promotion"].(map[string]any)
	if !ok {
		t.Fatalf("promotion missing or wrong type: %#v", doc["promotion"])
	}
	if promo["promoted_by"] != "admin@example.com" {
		t.Fatalf("promoted_by = %v, want admin@example.com", promo["promoted_by"])
	}
	if promotedAt, _ := promo["promoted_at"].(string); promotedAt == "" {
		t.Fatalf("promoted_at not set: %#v", promo["promoted_at"])
	}
}
