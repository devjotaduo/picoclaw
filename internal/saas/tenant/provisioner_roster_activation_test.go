package tenant

// TestProvisionerRosterActivation_BornConfigured verifies the two-call sequence
// that runProvision executes inside the `if !ws.IsRaw { ... }` block after
// SetAgentsRoster:
//
//  1. SetAgentsRoster patches agents.roster in config.json (no panel changes).
//  2. ActivateRosterAgents toggles panel_enabled so exactly the listed ids
//     (plus always-on main) are visible from first boot.
//
// runProvision itself cannot be unit-tested without a real Postgres DB, Docker
// daemon, and LiteLLM endpoint (provisioner_test.go documents this). Instead
// this test targets the seam the new code adds — the filesystem calls that
// happen between the existing SetAgentsRoster and the new ActivateRosterAgents
// — using the same tmpdir fixtures the B1 tests already cover.
//
// The test proves:
//   - Activation runs after roster seed and is not a no-op.
//   - Only the listed agent ids (clara, camila) are panel-enabled; others
//     (marcos, lia) are disabled.
//   - main is never toggled off.
//   - Empty activeAgentIDs leaves config.json byte-identical (public/admin path).
import (
	"os"
	"path/filepath"
	"testing"
)

func TestProvisionerRosterActivation_BornConfigured(t *testing.T) {
	// vol starts with all agents panel_enabled=true (worst case: a workspace
	// that has every agent turned on). Activation must selectively disable
	// everything not in the roster.
	vol := writeRecommendedAgentFixture(t, nil)

	// Simulate the roster patch step (SetAgentsRoster is a no-op when roster
	// is empty, but we call it to mirror the actual runProvision sequence).
	if err := SetAgentsRoster(vol, []string{"attendant", "assistant"}); err != nil {
		t.Fatalf("SetAgentsRoster: %v", err)
	}

	// Now call the new step: ActivateRosterAgents with the ids the tenant type
	// resolves to (clara = atendente, camila = assistente configurador).
	activeAgentIDs := []string{"clara", "camila"}
	result, err := ActivateRosterAgents(vol, activeAgentIDs)
	if err != nil {
		t.Fatalf("ActivateRosterAgents: %v", err)
	}
	if !result.Applied {
		t.Fatalf("expected Applied=true, got %+v", result)
	}
	if result.Source != "tenant_type" {
		t.Fatalf("result.Source=%q, want tenant_type", result.Source)
	}

	cfg := readConfigMap(t, filepath.Join(vol, "config.json"))

	wantPanel := map[string]bool{
		"clara":  true,
		"camila": true,
		"marcos": false,
		"lia":    false,
	}
	for id, want := range wantPanel {
		got, ok := panelEnabledFor(t, cfg, id)
		if !ok {
			t.Fatalf("agent %s not found in config.json", id)
		}
		if got != want {
			t.Errorf("agent %s panel_enabled=%v, want %v", id, got, want)
		}
	}

	// main is always-on and must not be disabled.
	got, ok := panelEnabledFor(t, cfg, "main")
	if !ok {
		t.Fatal("agent main not found in config.json")
	}
	if !got {
		t.Fatal("main panel_enabled must remain true after roster activation")
	}

	// Audit artifact must be written.
	auditPath := filepath.Join(vol, "workspace", "config", "agent-activation.json")
	if _, err := os.Stat(auditPath); err != nil {
		t.Fatalf("agent-activation.json not written: %v", err)
	}
}

func TestProvisionerRosterActivation_EmptyActiveAgentsIsNoOp(t *testing.T) {
	// Public / admin tenants pass empty ActiveAgentIDs. The provisioner guards
	// with `if len(activeAgentIDs) > 0` so ActivateRosterAgents is never
	// called — but we also verify that ActivateRosterAgents itself is
	// fail-open when called with nil, so both layers of protection work.
	vol := writeRecommendedAgentFixture(t, nil)
	before, err := os.ReadFile(filepath.Join(vol, "config.json"))
	if err != nil {
		t.Fatal(err)
	}

	result, err := ActivateRosterAgents(vol, nil)
	if err != nil {
		t.Fatalf("ActivateRosterAgents(nil): %v", err)
	}
	if result.Applied {
		t.Fatalf("empty ids must be a no-op, got Applied=true: %+v", result)
	}

	after, err := os.ReadFile(filepath.Join(vol, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Fatalf("config.json must be unchanged when activeAgentIDs is empty\nbefore=%s\nafter=%s", before, after)
	}
}
