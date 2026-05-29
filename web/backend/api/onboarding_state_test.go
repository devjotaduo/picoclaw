package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReadOnboardingStateMissingReturnsDefaultWithoutLeakingPath(t *testing.T) {
	workspace := t.TempDir()
	got, exists, err := readOnboardingState(workspace, time.Date(2026, 5, 28, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("readOnboardingState() error = %v", err)
	}
	if exists {
		t.Fatal("exists = true, want false")
	}
	if got.Phase != "discovery_in_progress" {
		t.Fatalf("phase = %q, want discovery_in_progress", got.Phase)
	}
	if got.Deepening.Agent != "catarina" {
		t.Fatalf("deepening agent = %q, want catarina", got.Deepening.Agent)
	}
	if len(got.Deepening.AreasRequired) != 5 {
		t.Fatalf("areas_required len = %d, want 5", len(got.Deepening.AreasRequired))
	}
	raw, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("Marshal state error = %v", err)
	}
	if strings.Contains(string(raw), workspace) {
		t.Fatal("state response should not expose absolute workspace path")
	}
}

func TestHandleGetOnboardingStateReturnsPromotedState(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("state", "onboarding.json"), `{
  "schema_version": 3,
  "phase": "promoted",
  "discovery": {
    "started_at": "2026-05-26T22:30:00Z",
    "completed_at": "2026-05-26T22:50:00Z",
    "segment": "clinica",
    "summary": "Clinica com agenda por WhatsApp.",
    "agent": "sofia"
  },
  "deepening": {
    "started_at": "2026-05-26T22:51:00Z",
    "first_contact_at": "2026-05-26T23:00:00Z",
    "last_outreach_at": "2026-05-26T23:00:00Z",
    "last_owner_response_at": "2026-05-26T23:10:00Z",
    "areas_covered": ["equipe", "faq", "casos-excecao", "historico", "regras-tacitas"],
    "areas_required": ["equipe", "casos-excecao", "faq", "historico", "regras-tacitas"],
    "completed_at": "2026-05-26T23:20:00Z",
    "agent": "catarina"
  },
  "owner_captured": {
    "name": "Eduardo Silva",
    "email": "eduardo@example.com",
    "whatsapp": "+5587988553793",
    "captured_by": "sofia",
    "captured_at": "2026-05-26T22:45:00Z"
  },
  "promotion": {
    "ready": false,
    "blocked_by": [],
    "promoted_at": "2026-05-27T10:00:00Z",
    "promoted_by": "rutherles@gmail.com"
  }
}`)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/workspace/onboarding-state", nil)
	h.handleGetOnboardingState(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET onboarding-state = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var got onboardingStateResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("Decode response error = %v", err)
	}
	if !got.Exists {
		t.Fatal("exists = false, want true")
	}
	if got.Workspace != "workspace" {
		t.Fatalf("workspace = %q, want workspace", got.Workspace)
	}
	if got.State.Phase != "promoted" {
		t.Fatalf("phase = %q, want promoted", got.State.Phase)
	}
	if got.State.OwnerCaptured.Email == nil || *got.State.OwnerCaptured.Email != "eduardo@example.com" {
		t.Fatalf("owner email = %#v, want eduardo@example.com", got.State.OwnerCaptured.Email)
	}
}

func TestReadOnboardingStateInvalidJSONReturnsError(t *testing.T) {
	workspace := t.TempDir()
	path := filepath.Join(workspace, "state", "onboarding.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte("{"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if _, exists, err := readOnboardingState(workspace, time.Now()); err == nil || !exists {
		t.Fatalf("readOnboardingState invalid JSON exists=%v err=%v, want exists true and error", exists, err)
	}
}
