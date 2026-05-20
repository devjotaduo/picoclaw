package tenant

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	picoconfig "github.com/sipeed/picoclaw/pkg/config"
)

const defaultLauncherWorkspace = "/root/.picoclaw/workspace"

var defaultLauncherProfileAgentIDs = []string{
	orchestrator.AgentMain,
	orchestrator.AgentSales,
	orchestrator.AgentMarketing,
	orchestrator.AgentAssistant,
}

var defaultLauncherProfileAgentSet = map[string]struct{}{
	orchestrator.AgentMain:      {},
	orchestrator.AgentSales:     {},
	orchestrator.AgentMarketing: {},
	orchestrator.AgentAssistant: {},
}

// InitializeDefaultLauncherProfileSeed creates a new launcher profile seed from
// the standalone template, then normalizes it to the managed 4-agent baseline.
func InitializeDefaultLauncherProfileSeed(templateDir, seedPath string) error {
	if seedPath == "" {
		return fmt.Errorf("profile seed path is empty")
	}
	if err := os.RemoveAll(seedPath); err != nil {
		return err
	}
	if err := os.MkdirAll(seedPath, 0o755); err != nil {
		return err
	}
	if templateDir != "" {
		if err := CopyTemplate(templateDir, seedPath); err != nil {
			return err
		}
	}
	_, err := NormalizeDefaultLauncherProfileSeed(seedPath)
	return err
}

// NormalizeDefaultLauncherProfileSeed makes the default launcher profile seed
// the source of truth for the official Ana, Leo, Maya and Sofia baseline.
func NormalizeDefaultLauncherProfileSeed(seedPath string) (bool, error) {
	if seedPath == "" {
		return false, fmt.Errorf("profile seed path is empty")
	}
	if err := os.MkdirAll(seedPath, 0o755); err != nil {
		return false, err
	}
	if err := SanitizeSeed(seedPath); err != nil {
		return false, err
	}

	configPath := filepath.Join(seedPath, "config.json")
	before, err := os.ReadFile(configPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return false, err
	}

	root := map[string]any{}
	if len(strings.TrimSpace(string(before))) > 0 {
		if err := json.Unmarshal(before, &root); err != nil {
			return false, fmt.Errorf("parse config.json: %w", err)
		}
		if root == nil {
			root = map[string]any{}
		}
	}
	if err := normalizeDefaultLauncherProfileConfig(root); err != nil {
		return false, err
	}

	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return false, err
	}
	out = append(out, '\n')

	changed := !bytes.Equal(before, out)
	if changed {
		if err := os.WriteFile(configPath, out, 0o600); err != nil {
			return false, err
		}
	}
	removed, err := removeDefaultLauncherProfileOrphans(seedPath)
	if err != nil {
		return false, err
	}
	return changed || removed, nil
}

func normalizeDefaultLauncherProfileConfig(root map[string]any) error {
	if root["version"] == nil {
		root["version"] = float64(3)
	}
	ensureDefaultLauncherUI(root)
	ensureWhatsAppNativeOnlyChannels(root)

	agents := ensureSeedMap(root, "agents")
	defaults := ensureSeedMap(agents, "defaults")
	baseWorkspace, _ := defaults["workspace"].(string)
	baseWorkspace = strings.TrimSpace(baseWorkspace)
	if baseWorkspace == "" {
		baseWorkspace = defaultLauncherWorkspace
		defaults["workspace"] = baseWorkspace
	}

	existing := indexDefaultProfileAgents(agents["list"])
	officialAgents, err := officialDefaultProfileAgents(baseWorkspace)
	if err != nil {
		return err
	}
	for _, agent := range officialAgents {
		id, _ := agent["id"].(string)
		if old := existing[id]; old != nil {
			preserveDefaultProfileAgentRuntimeFields(agent, old)
		}
	}

	list := make([]any, 0, len(officialAgents))
	for _, agent := range officialAgents {
		list = append(list, agent)
	}
	agents["list"] = list
	return nil
}

func ensureDefaultLauncherUI(root map[string]any) {
	ui, _ := root["ui"].(map[string]any)
	if ui == nil {
		ui = map[string]any{}
		root["ui"] = ui
	}
	if _, ok := ui["show_reasoning"].(bool); !ok {
		ui["show_reasoning"] = true
	}
	if _, ok := ui["show_tool_calls"].(bool); !ok {
		ui["show_tool_calls"] = true
	}
	if _, ok := ui["show_model_selector"].(bool); !ok {
		ui["show_model_selector"] = true
	}
}

func indexDefaultProfileAgents(raw any) map[string]map[string]any {
	out := map[string]map[string]any{}
	list, _ := raw.([]any)
	for _, item := range list {
		agent, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, _ := agent["id"].(string)
		id = orchestrator.CanonicalAgentID(id)
		if _, official := defaultLauncherProfileAgentSet[id]; !official {
			continue
		}
		if _, exists := out[id]; !exists {
			out[id] = agent
		}
	}
	return out
}

func officialDefaultProfileAgents(baseWorkspace string) ([]map[string]any, error) {
	cfg := &picoconfig.Config{
		Agents: picoconfig.AgentsConfig{
			Defaults: picoconfig.AgentDefaults{
				Workspace: baseWorkspace,
			},
		},
	}
	orchestrator.EnsureSpecialistConfig(cfg)

	byID := map[string]picoconfig.AgentConfig{}
	for _, agent := range cfg.Agents.List {
		id := orchestrator.CanonicalAgentID(agent.ID)
		if _, official := defaultLauncherProfileAgentSet[id]; official {
			byID[id] = agent
		}
	}

	out := make([]map[string]any, 0, len(defaultLauncherProfileAgentIDs))
	for _, id := range defaultLauncherProfileAgentIDs {
		agent, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("official launcher agent %q was not generated", id)
		}
		m, err := agentConfigToMap(agent)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

func agentConfigToMap(agent picoconfig.AgentConfig) (map[string]any, error) {
	b, err := json.Marshal(agent)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func preserveDefaultProfileAgentRuntimeFields(next, old map[string]any) {
	for _, key := range []string{"model", "skills"} {
		if value, ok := old[key]; ok {
			next[key] = value
		}
	}
}

func removeDefaultLauncherProfileOrphans(seedPath string) (bool, error) {
	changed := false
	for _, rel := range []string{
		filepath.Join("agents", "programador"),
		"workspace-programador",
	} {
		path := filepath.Join(seedPath, rel)
		if _, err := os.Stat(path); err == nil {
			if err := os.RemoveAll(path); err != nil {
				return changed, err
			}
			changed = true
		} else if !errors.Is(err, os.ErrNotExist) {
			return changed, err
		}
	}
	return changed, nil
}

func ensureSeedMap(parent map[string]any, key string) map[string]any {
	child, _ := parent[key].(map[string]any)
	if child == nil {
		child = map[string]any{}
		parent[key] = child
	}
	return child
}
