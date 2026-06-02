package tenant

import (
	"path/filepath"
	"testing"
)

func TestActivateRosterAgentsTogglesOnlyListed(t *testing.T) {
	// writeRecommendedAgentFixture seeds config.json with the full togglable
	// agent set; we assert only on the subset relevant here (clara/camila
	// enabled, marcos/lia disabled). nil onboarding so only config.json matters.
	vol := writeRecommendedAgentFixture(t, nil)

	result, err := ActivateRosterAgents(vol, []string{"clara", "camila"})
	if err != nil {
		t.Fatalf("ActivateRosterAgents: %v", err)
	}
	if !result.Applied {
		t.Fatalf("result.Applied should be true: %+v", result)
	}
	if result.Source != "tenant_type" {
		t.Fatalf("result.Source = %q, want tenant_type", result.Source)
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
			t.Fatalf("agent %s panel_enabled=%v, want %v", id, got, want)
		}
	}

	// main must never be toggled off by this function (it is not in toggleSet)
	got, ok := panelEnabledFor(t, cfg, "main")
	if !ok {
		t.Fatal("agent main not found in config.json")
	}
	if !got {
		t.Fatal("main panel_enabled should remain true (not in toggleSet)")
	}
}

func TestActivateRosterAgentsEmptyIDsIsNoOp(t *testing.T) {
	vol := writeRecommendedAgentFixture(t, nil)

	result, err := ActivateRosterAgents(vol, nil)
	if err != nil {
		t.Fatalf("ActivateRosterAgents(nil): %v", err)
	}
	if result.Applied {
		t.Fatalf("empty ids should be a no-op, got Applied=true: %+v", result)
	}
	if result.FailOpenWhy != "no_recommended_agents" {
		t.Fatalf("FailOpenWhy = %q, want no_recommended_agents", result.FailOpenWhy)
	}
}

func TestActivateRosterAgentsNormalizesAliases(t *testing.T) {
	vol := writeRecommendedAgentFixture(t, nil)

	// "Rafael" is an alias for "main"; "agente-cobranca" is unknown and dropped.
	result, err := ActivateRosterAgents(vol, []string{"Rafael", "Clara", "agente-cobranca"})
	if err != nil {
		t.Fatalf("ActivateRosterAgents: %v", err)
	}
	// clara should be enabled, luna/marcos/camila/lia should be disabled
	cfg := readConfigMap(t, filepath.Join(vol, "config.json"))
	if got, _ := panelEnabledFor(t, cfg, "clara"); !got {
		t.Fatal("clara should be enabled after roster activation with Clara")
	}
	if got, _ := panelEnabledFor(t, cfg, "luna"); got {
		t.Fatal("luna should be disabled (not in roster ids)")
	}
	// "Rafael"→main + "Clara" normalize to a non-empty roster, so activation
	// must have applied (guards against NormalizeRecommendedAgentIDs silently
	// dropping everything to a no-op).
	if !result.Applied {
		t.Fatalf("expected Applied=true after normalizing Rafael+Clara, got %+v", result)
	}
}
