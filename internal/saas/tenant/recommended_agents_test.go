package tenant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNormalizeRecommendedAgentIDs(t *testing.T) {
	got := NormalizeRecommendedAgentIDs([]string{
		"Clara",
		"Luna",
		"Rafael",
		"agente-cobranca",
		"clara",
	})
	want := []string{"clara", "luna", "main"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NormalizeRecommendedAgentIDs() = %#v, want %#v", got, want)
	}
}

func TestActivateRecommendedAgentsFromOnboardingTogglesPanelOnlyForRecommended(t *testing.T) {
	vol := writeRecommendedAgentFixture(t, []string{"clara", "luna", "camila"})

	result, err := ActivateRecommendedAgents(vol)
	if err != nil {
		t.Fatalf("ActivateRecommendedAgents: %v", err)
	}
	if !result.Applied || !result.NeedsReload {
		t.Fatalf("result should mark config application + reload: %+v", result)
	}
	if result.Source != "onboarding.json" {
		t.Fatalf("source = %q, want onboarding.json", result.Source)
	}

	cfg := readConfigMap(t, filepath.Join(vol, "config.json"))
	wantPanel := map[string]bool{
		"main":       true,
		"clara":      true,
		"luna":       true,
		"camila":     true,
		"marcos":     false,
		"lia":        false,
		"sofia":      false,
		"catarina":   false,
		"vendas":     true,
		"marketing":  true,
		"assistente": true,
		"operador":   true,
	}
	for id, want := range wantPanel {
		got, ok := panelEnabledFor(t, cfg, id)
		if !ok {
			t.Fatalf("agent %s not found", id)
		}
		if got != want {
			t.Fatalf("agent %s panel_enabled=%v, want %v", id, got, want)
		}
	}

	audit := readActivationAudit(t, vol)
	if audit.Source != "onboarding.json" {
		t.Fatalf("audit source = %q", audit.Source)
	}
	if !reflect.DeepEqual(audit.ActiveAgents, []string{"camila", "clara", "luna", "main"}) {
		t.Fatalf("audit active agents = %#v", audit.ActiveAgents)
	}
	if audit.FailOpenWhy != "" {
		t.Fatalf("audit should not fail open: %+v", audit)
	}
}

func TestActivateRecommendedAgentsIsIdempotent(t *testing.T) {
	vol := writeRecommendedAgentFixture(t, []string{"clara", "luna"})
	if _, err := ActivateRecommendedAgents(vol); err != nil {
		t.Fatalf("first ActivateRecommendedAgents: %v", err)
	}
	second, err := ActivateRecommendedAgents(vol)
	if err != nil {
		t.Fatalf("second ActivateRecommendedAgents: %v", err)
	}
	if second.Applied || second.NeedsReload {
		t.Fatalf("second run should not rewrite config: %+v", second)
	}
}

func TestActivateRecommendedAgentsFailOpenWithoutRecommendation(t *testing.T) {
	vol := writeRecommendedAgentFixture(t, nil)
	before, err := os.ReadFile(filepath.Join(vol, "config.json"))
	if err != nil {
		t.Fatal(err)
	}

	result, err := ActivateRecommendedAgents(vol)
	if err != nil {
		t.Fatalf("ActivateRecommendedAgents: %v", err)
	}
	if result.Applied || result.FailOpenWhy != "no_recommended_agents" {
		t.Fatalf("result = %+v, want fail-open no_recommended_agents", result)
	}
	after, err := os.ReadFile(filepath.Join(vol, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Fatalf("config changed despite missing recommendation:\nbefore=%s\nafter=%s", before, after)
	}
	if _, err := os.Stat(filepath.Join(vol, "workspace", "config", "agent-activation.json")); !os.IsNotExist(err) {
		t.Fatalf("audit artifact should not be written without recommendation, err=%v", err)
	}
}

func TestActivateRecommendedAgentsFallsBackToEmpresaMD(t *testing.T) {
	vol := writeRecommendedAgentFixture(t, []string{})
	if err := os.Remove(filepath.Join(vol, "workspace", "state", "onboarding.json")); err != nil {
		t.Fatal(err)
	}
	empresaPath := filepath.Join(vol, "workspace", "memory", "empresa.md")
	if err := os.MkdirAll(filepath.Dir(empresaPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(empresaPath, []byte(`# Empresa

## Agentes recomendados
- Clara
- Rafael
`), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := ActivateRecommendedAgents(vol)
	if err != nil {
		t.Fatalf("ActivateRecommendedAgents: %v", err)
	}
	if !result.Applied || result.Source != "empresa.md" {
		t.Fatalf("result = %+v, want applied from empresa.md", result)
	}
	cfg := readConfigMap(t, filepath.Join(vol, "config.json"))
	got, _ := panelEnabledFor(t, cfg, "clara")
	if !got {
		t.Fatal("clara should be visible from empresa.md fallback")
	}
	got, _ = panelEnabledFor(t, cfg, "luna")
	if got {
		t.Fatal("luna should be hidden when not recommended")
	}
}

func writeRecommendedAgentFixture(t *testing.T, recommended []string) string {
	t.Helper()
	vol := t.TempDir()
	if err := os.MkdirAll(filepath.Join(vol, "workspace", "state"), 0o755); err != nil {
		t.Fatal(err)
	}
	if recommended != nil {
		state := map[string]any{
			"discovery": map[string]any{
				"agentes_recomendados": recommended,
			},
		}
		raw, err := json.Marshal(state)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(vol, "workspace", "state", "onboarding.json"), raw, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(vol, "config.json"), []byte(`{
  "agents": {
    "list": [
      {"id": "main", "access": {"panel_enabled": true}},
      {"id": "clara", "access": {"panel_enabled": true}},
      {"id": "luna", "access": {"panel_enabled": true}},
      {"id": "marcos", "access": {"panel_enabled": true}},
      {"id": "camila", "access": {"panel_enabled": true}},
      {"id": "lia", "access": {"panel_enabled": true}},
      {"id": "sofia", "access": {"panel_enabled": true}},
      {"id": "catarina", "access": {"panel_enabled": true}},
      {"id": "vendas", "access": {"panel_enabled": true}},
      {"id": "marketing", "access": {"panel_enabled": true}},
      {"id": "assistente", "access": {"panel_enabled": true}},
      {"id": "operador", "access": {"panel_enabled": true}}
    ]
  }
}`), 0o640); err != nil {
		t.Fatal(err)
	}
	return vol
}

func readConfigMap(t *testing.T, path string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	return cfg
}

func panelEnabledFor(t *testing.T, cfg map[string]any, id string) (bool, bool) {
	t.Helper()
	agents := cfg["agents"].(map[string]any)
	list := agents["list"].([]any)
	for _, item := range list {
		agent := item.(map[string]any)
		if agent["id"] != id {
			continue
		}
		access := agent["access"].(map[string]any)
		got, _ := access["panel_enabled"].(bool)
		return got, true
	}
	return false, false
}

func readActivationAudit(t *testing.T, vol string) RecommendedAgentsActivationResult {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(vol, "workspace", "config", "agent-activation.json"))
	if err != nil {
		t.Fatal(err)
	}
	var audit RecommendedAgentsActivationResult
	if err := json.Unmarshal(raw, &audit); err != nil {
		t.Fatal(err)
	}
	return audit
}
