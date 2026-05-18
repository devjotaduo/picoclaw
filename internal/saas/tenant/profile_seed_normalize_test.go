package tenant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNormalizeDefaultLauncherProfileSeedRepairsLegacyAgents(t *testing.T) {
	seed := t.TempDir()
	mustWrite(t, filepath.Join(seed, "config.json"), []byte(`{
	  "version": 3,
	  "ui": {"show_reasoning": false},
	  "agents": {
	    "defaults": {
	      "workspace": "/root/.picoclaw/workspace",
	      "provider": "openrouter",
	      "model_name": "openrouter-sonnet-4.5"
	    },
	    "list": [
	      {
	        "id": "main",
	        "default": true,
	        "name": "Carlão",
	        "workspace": "/root/.picoclaw/workspace",
	        "model": "openrouter-sonnet-4.5",
	        "skills": ["faq-answering", "intent-routing"],
	        "subagents": {"allow_agents": ["vendas", "marketing", "programador"]}
	      },
	      {
	        "id": "vendas",
	        "name": "Consultor de Vendas",
	        "workspace": "/root/.picoclaw/agents/vendas",
	        "model": "openrouter-sonnet-4.5",
	        "skills": ["lead-qualification"]
	      },
	      {
	        "id": "marketing",
	        "name": "Estrategista Instagram",
	        "workspace": "/root/.picoclaw/agents/marketing",
	        "model": "openrouter-sonnet-4.5",
	        "skills": ["image-gen-openrouter"]
	      },
	      {
	        "id": "programador",
	        "name": "Programador",
	        "workspace": "/root/.picoclaw/agents/programador",
	        "model": "openrouter-sonnet-4.5",
	        "skills": ["github"]
	      }
	    ]
	  },
	  "model_list": [{"model_name": "openrouter-sonnet-4.5", "provider": "openrouter"}],
	  "channel_list": {"whatsapp": {"enabled": true, "type": "whatsapp_native"}}
	}`), 0o600)
	mustWrite(t, filepath.Join(seed, "agents", "programador", "AGENT.md"), []byte("legacy programador"), 0o644)

	changed, err := NormalizeDefaultLauncherProfileSeed(seed)
	if err != nil {
		t.Fatalf("NormalizeDefaultLauncherProfileSeed: %v", err)
	}
	if !changed {
		t.Fatal("expected legacy seed to be repaired")
	}

	root := readSeedConfig(t, seed)
	ui := root["ui"].(map[string]any)
	if got := ui["show_reasoning"]; got != false {
		t.Fatalf("ui.show_reasoning = %v, want false preserved", got)
	}
	if got := ui["show_tool_calls"]; got != true {
		t.Fatalf("ui.show_tool_calls = %v, want true default", got)
	}
	if got := ui["show_model_selector"]; got != true {
		t.Fatalf("ui.show_model_selector = %v, want true default", got)
	}
	if _, ok := root["model_list"]; !ok {
		t.Fatal("model_list should be preserved")
	}
	if _, ok := root["channel_list"]; !ok {
		t.Fatal("channel_list should be preserved")
	}

	agents := root["agents"].(map[string]any)
	list := agents["list"].([]any)
	gotIDs := make([]string, 0, len(list))
	byID := map[string]map[string]any{}
	for _, item := range list {
		agent := item.(map[string]any)
		id := agent["id"].(string)
		gotIDs = append(gotIDs, id)
		byID[id] = agent
	}
	wantIDs := []string{"main", "vendas", "marketing", "assistente"}
	if !reflect.DeepEqual(gotIDs, wantIDs) {
		t.Fatalf("agent ids = %#v, want %#v", gotIDs, wantIDs)
	}
	if got := byID["main"]["name"]; got != "Ana" {
		t.Fatalf("main name = %v, want Ana", got)
	}
	if got := byID["vendas"]["name"]; got != "Leo" {
		t.Fatalf("vendas name = %v, want Leo", got)
	}
	if got := byID["marketing"]["name"]; got != "Maya" {
		t.Fatalf("marketing name = %v, want Maya", got)
	}
	if got := byID["assistente"]["name"]; got != "Sofia" {
		t.Fatalf("assistente name = %v, want Sofia", got)
	}
	if got := byID["main"]["skills"]; !reflect.DeepEqual(got, []any{"faq-answering", "intent-routing"}) {
		t.Fatalf("main skills = %#v, want preserved", got)
	}
	if got := byID["main"]["model"]; got != "openrouter-sonnet-4.5" {
		t.Fatalf("main model = %#v, want preserved", got)
	}
	mainSubagents := byID["main"]["subagents"].(map[string]any)
	if got := mainSubagents["allow_agents"]; !reflect.DeepEqual(got, []any{"vendas"}) {
		t.Fatalf("main subagents = %#v, want [vendas]", got)
	}
	assistant := byID["assistente"]
	if assistant["access"] == nil || assistant["role_config"] == nil {
		t.Fatalf("assistente should have access and role_config defaults: %#v", assistant)
	}
	if _, err := os.Stat(filepath.Join(seed, "agents", "programador")); !os.IsNotExist(err) {
		t.Fatalf("programador dir should be removed, stat err = %v", err)
	}

	changed, err = NormalizeDefaultLauncherProfileSeed(seed)
	if err != nil {
		t.Fatalf("second NormalizeDefaultLauncherProfileSeed: %v", err)
	}
	if changed {
		t.Fatal("second normalize should be idempotent")
	}
}

func TestInitializeDefaultLauncherProfileSeedCopiesTemplateAndNormalizes(t *testing.T) {
	template := t.TempDir()
	seed := filepath.Join(t.TempDir(), "seed")
	mustWrite(t, filepath.Join(template, "config.json"), []byte(`{
	  "version": 3,
	  "agents": {
	    "defaults": {"workspace": "/root/.picoclaw/workspace"},
	    "list": [
	      {"id": "main", "name": "Custom", "skills": ["faq-answering"]},
	      {"id": "programador", "name": "Programador", "skills": ["github"]}
	    ]
	  }
	}`), 0o600)
	mustWrite(t, filepath.Join(template, "workspace", "AGENT.md"), []byte("main prompt"), 0o644)
	mustWrite(t, filepath.Join(template, "agents", "programador", "AGENT.md"), []byte("programador"), 0o644)

	if err := InitializeDefaultLauncherProfileSeed(template, seed); err != nil {
		t.Fatalf("InitializeDefaultLauncherProfileSeed: %v", err)
	}

	assertFile(t, filepath.Join(seed, "workspace", "AGENT.md"), "main prompt")
	root := readSeedConfig(t, seed)
	agents := root["agents"].(map[string]any)
	list := agents["list"].([]any)
	if len(list) != 4 {
		t.Fatalf("agents.list len = %d, want 4", len(list))
	}
	last := list[3].(map[string]any)
	if got := last["id"]; got != "assistente" {
		t.Fatalf("last agent id = %v, want assistente", got)
	}
	if _, err := os.Stat(filepath.Join(seed, "agents", "programador")); !os.IsNotExist(err) {
		t.Fatalf("programador dir should be removed, stat err = %v", err)
	}
}

func TestNormalizeDefaultLauncherProfileSeedDoesNotTouchTenantVolume(t *testing.T) {
	root := t.TempDir()
	seed := filepath.Join(root, "profile", "seed")
	tenantVolume := filepath.Join(root, "tenant")
	mustWrite(t, filepath.Join(seed, "config.json"), []byte(`{"agents":{"list":[{"id":"programador"}]}}`), 0o600)
	mustWrite(t, filepath.Join(tenantVolume, "config.json"), []byte(`{"agents":{"list":[{"id":"programador"}]}}`), 0o600)

	if _, err := NormalizeDefaultLauncherProfileSeed(seed); err != nil {
		t.Fatalf("NormalizeDefaultLauncherProfileSeed: %v", err)
	}

	assertFile(t, filepath.Join(tenantVolume, "config.json"), `{"agents":{"list":[{"id":"programador"}]}}`)
}

func readSeedConfig(t *testing.T, seed string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(seed, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := json.Unmarshal(b, &root); err != nil {
		t.Fatal(err)
	}
	return root
}
