package tenant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSetAgentsRosterPatchesAndPreserves(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	// config.json with a placeholder token and a sibling top-level field that
	// must survive the patch untouched.
	original := `{
  "model_list": [{"model_name": "x", "api_key": "${LITELLM_KEY}"}],
  "agents": {"defaults": {"model_name": "x"}}
}`
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := SetAgentsRoster(dir, []string{"attendant", "assistant"}); err != nil {
		t.Fatalf("SetAgentsRoster: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "${LITELLM_KEY}") {
		t.Error("placeholder token must survive the roster patch")
	}

	var parsed struct {
		ModelList []map[string]any `json:"model_list"`
		Agents    struct {
			Defaults map[string]any `json:"defaults"`
			Roster   []string       `json:"roster"`
		} `json:"agents"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("result is not valid json: %v", err)
	}
	if len(parsed.Agents.Roster) != 2 || parsed.Agents.Roster[0] != "attendant" {
		t.Errorf("roster not set correctly: %v", parsed.Agents.Roster)
	}
	if parsed.Agents.Defaults["model_name"] != "x" {
		t.Error("existing agents.defaults must be preserved")
	}
	if len(parsed.ModelList) != 1 {
		t.Error("model_list must be preserved")
	}
}

func TestSetAgentsRosterEmptyIsNoop(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	original := `{"agents": {"defaults": {}}}`
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := SetAgentsRoster(dir, nil); err != nil {
		t.Fatalf("empty roster should be a no-op, got %v", err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != original {
		t.Errorf("empty roster must leave config.json byte-identical, got %q", string(data))
	}
}

func TestSetAgentsRosterMissingConfigIsNoop(t *testing.T) {
	if err := SetAgentsRoster(t.TempDir(), []string{"attendant"}); err != nil {
		t.Errorf("missing config.json should be a no-op, got %v", err)
	}
}
