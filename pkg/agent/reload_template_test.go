package agent

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/config"
)

func TestReloadProviderAndConfigRefreshesTemplateRuntimeFiles(t *testing.T) {
	workspace := setupWorkspace(t, map[string]string{
		"AGENT.md": `---
model: old-template-model
skills: [old-skill]
---
# Old Agent

Use old instructions.
`,
		"SOUL.md":       "# Soul\nOld soul identity.",
		"behavior.json": `{"master_enabled":true,"respond_in_dm":true,"respond_in_groups":true}`,
	})
	defer cleanupWorkspace(t, workspace)

	cfg := &config.Config{
		Agents: config.AgentsConfig{
			Defaults: config.AgentDefaults{
				Workspace: workspace,
				ModelName: "default-model",
			},
		},
	}

	al := NewAgentLoop(cfg, bus.NewMessageBus(), &mockProvider{})
	defer al.Close()

	initial := al.GetRegistry().GetDefaultAgent()
	if initial.Model != "old-template-model" {
		t.Fatalf("initial model = %q, want old-template-model", initial.Model)
	}
	if !initial.Behavior.MasterEnabled {
		t.Fatal("initial behavior should come from old behavior.json")
	}

	writeRuntimeFile(t, workspace, "AGENT.md", `---
model: new-template-model
skills:
  - new-visible-skill
---
# New Agent

Use new template instructions.
`)
	writeRuntimeFile(t, workspace, "SOUL.md", "# Soul\nNew soul identity.")
	writeRuntimeFile(t, workspace, "behavior.json", `{
  "master_enabled": false,
  "respond_in_dm": false,
  "respond_in_groups": false,
  "ignore_other_bots": true,
  "process_images": false
}`)

	if err := al.ReloadProviderAndConfig(context.Background(), &mockProvider{}, cfg); err != nil {
		t.Fatalf("ReloadProviderAndConfig() error = %v", err)
	}

	reloaded := al.GetRegistry().GetDefaultAgent()
	if reloaded.Model != "new-template-model" {
		t.Fatalf("reloaded model = %q, want new-template-model", reloaded.Model)
	}
	if len(reloaded.SkillsFilter) != 1 || reloaded.SkillsFilter[0] != "new-visible-skill" {
		t.Fatalf("reloaded skills = %v, want [new-visible-skill]", reloaded.SkillsFilter)
	}
	if reloaded.Behavior.MasterEnabled || reloaded.Behavior.RespondInDM || reloaded.Behavior.RespondInGroups {
		t.Fatalf("reloaded behavior flags not reflected: %+v", reloaded.Behavior)
	}
	if !reloaded.Behavior.IgnoreOtherBots || reloaded.Behavior.ProcessImages {
		t.Fatalf("reloaded behavior details not reflected: %+v", reloaded.Behavior)
	}

	prompt := reloaded.ContextBuilder.BuildSystemPromptWithCache()
	if !strings.Contains(prompt, "Use new template instructions.") ||
		!strings.Contains(prompt, "New soul identity.") {
		t.Fatalf("reloaded prompt missing new AGENT.md/SOUL.md content:\n%s", prompt)
	}
	if strings.Contains(prompt, "Use old instructions.") || strings.Contains(prompt, "Old soul identity.") {
		t.Fatalf("reloaded prompt still contains stale template content:\n%s", prompt)
	}
}

func writeRuntimeFile(t *testing.T, workspace, name, content string) {
	t.Helper()
	path := filepath.Join(workspace, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}
