package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/sipeed/picoclaw/pkg/config"
)

type onboardingStateResponse struct {
	Workspace   string                 `json:"workspace"`
	Exists      bool                   `json:"exists"`
	GeneratedAt string                 `json:"generated_at"`
	State       onboardingJourneyState `json:"state"`
}

type onboardingJourneyState struct {
	SchemaVersion int                 `json:"schema_version,omitempty"`
	Phase         string              `json:"phase"`
	Discovery     onboardingDiscovery `json:"discovery"`
	Deepening     onboardingDeepening `json:"deepening"`
	OwnerCaptured onboardingOwner     `json:"owner_captured"`
	Promotion     onboardingPromotion `json:"promotion"`
}

type onboardingDiscovery struct {
	StartedAt   *string `json:"started_at"`
	CompletedAt *string `json:"completed_at"`
	Segment     *string `json:"segment"`
	Summary     *string `json:"summary"`
	Agent       string  `json:"agent"`
}

type onboardingDeepening struct {
	StartedAt            *string  `json:"started_at"`
	FirstContactAt       *string  `json:"first_contact_at"`
	LastOutreachAt       *string  `json:"last_outreach_at"`
	LastOwnerResponseAt  *string  `json:"last_owner_response_at"`
	LastBridgeAttemptAt  *string  `json:"last_bridge_attempt_at"`
	LastBridgeFailedAt   *string  `json:"last_bridge_failed_at"`
	LastBridgeError      *string  `json:"last_bridge_error"`
	AreasCovered         []string `json:"areas_covered"`
	AreasRequired        []string `json:"areas_required"`
	CompletedAt          *string  `json:"completed_at"`
	Agent                string   `json:"agent"`
	ForcedCompletionNote *string  `json:"forced_completion_reason"`
}

type onboardingOwner struct {
	Name       *string `json:"name"`
	Email      *string `json:"email"`
	WhatsApp   *string `json:"whatsapp"`
	CapturedBy *string `json:"captured_by"`
	CapturedAt *string `json:"captured_at"`
}

type onboardingPromotion struct {
	Ready      bool     `json:"ready"`
	BlockedBy  []string `json:"blocked_by"`
	PromotedAt *string  `json:"promoted_at"`
	PromotedBy *string  `json:"promoted_by"`
}

func (h *Handler) registerOnboardingStateRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/onboarding-state", h.handleGetOnboardingState)
}

func (h *Handler) handleGetOnboardingState(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}

	state, exists, err := readOnboardingState(cfg.WorkspacePath(), time.Now())
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load onboarding state: %v", err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, onboardingStateResponse{
		Workspace:   "workspace",
		Exists:      exists,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		State:       state,
	})
}

func readOnboardingState(workspace string, now time.Time) (onboardingJourneyState, bool, error) {
	statePath := filepath.Join(workspace, "state", "onboarding.json")
	raw, err := os.ReadFile(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultOnboardingState(now), false, nil
		}
		return onboardingJourneyState{}, false, err
	}

	state := defaultOnboardingState(now)
	if err := json.Unmarshal(raw, &state); err != nil {
		return onboardingJourneyState{}, true, err
	}
	normalizeOnboardingState(&state, now)
	return state, true, nil
}

func defaultOnboardingState(now time.Time) onboardingJourneyState {
	startedAt := now.UTC().Format(time.RFC3339)
	return onboardingJourneyState{
		SchemaVersion: 3,
		Phase:         "discovery_in_progress",
		Discovery: onboardingDiscovery{
			StartedAt: &startedAt,
			Agent:     "sofia",
		},
		Deepening: onboardingDeepening{
			AreasCovered:  []string{},
			AreasRequired: []string{"equipe", "casos-excecao", "faq", "historico", "regras-tacitas"},
			Agent:         "catarina",
		},
		OwnerCaptured: onboardingOwner{},
		Promotion: onboardingPromotion{
			Ready:     false,
			BlockedBy: []string{"discovery_incomplete"},
		},
	}
}

func normalizeOnboardingState(state *onboardingJourneyState, now time.Time) {
	if state.Phase == "" {
		state.Phase = "discovery_in_progress"
	}
	if state.Discovery.Agent == "" {
		state.Discovery.Agent = "sofia"
	}
	if state.Discovery.StartedAt == nil {
		startedAt := now.UTC().Format(time.RFC3339)
		state.Discovery.StartedAt = &startedAt
	}
	if state.Deepening.Agent == "" {
		state.Deepening.Agent = "catarina"
	}
	if state.Deepening.AreasCovered == nil {
		state.Deepening.AreasCovered = []string{}
	}
	if len(state.Deepening.AreasRequired) == 0 {
		state.Deepening.AreasRequired = []string{"equipe", "casos-excecao", "faq", "historico", "regras-tacitas"}
	}
	if state.Promotion.BlockedBy == nil {
		state.Promotion.BlockedBy = []string{}
	}
}
