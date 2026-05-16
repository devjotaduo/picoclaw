package agent

import (
	"testing"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/config"
)

func TestBehaviorProviderUsesRoutedAgentBehavior(t *testing.T) {
	mainWorkspace := setupWorkspace(t, map[string]string{
		"AGENT.md":      "# Main\nDefault agent.",
		"behavior.json": `{"master_enabled":true,"respond_in_dm":true,"respond_in_groups":true,"process_images":true}`,
	})
	defer cleanupWorkspace(t, mainWorkspace)
	supportWorkspace := setupWorkspace(t, map[string]string{
		"AGENT.md":      "# Support\nSupport agent.",
		"behavior.json": `{"master_enabled":true,"respond_in_dm":false,"respond_in_groups":true,"process_images":false}`,
	})
	defer cleanupWorkspace(t, supportWorkspace)

	cfg := &config.Config{
		Agents: config.AgentsConfig{
			Defaults: config.AgentDefaults{
				Workspace: mainWorkspace,
				ModelName: "default-model",
			},
			List: []config.AgentConfig{
				{ID: "main", Default: true, Workspace: mainWorkspace},
				{ID: "support", Workspace: supportWorkspace},
			},
			Dispatch: &config.DispatchConfig{Rules: []config.DispatchRule{
				{
					Name:  "whatsapp support",
					Agent: "support",
					When:  config.DispatchSelector{Channel: "whatsapp"},
				},
			}},
		},
	}

	loop := NewAgentLoop(cfg, bus.NewMessageBus(), &mockProvider{})
	defer loop.Close()

	provider := NewBehaviorProvider(loop)
	contextual, ok := provider.(channels.ContextBehaviorProvider)
	if !ok {
		t.Fatal("NewBehaviorProvider should support context-aware behavior lookup")
	}

	supportBehavior := contextual.ChannelBehaviorForContext(bus.InboundContext{
		Channel:  "whatsapp",
		ChatType: "direct",
	})
	if supportBehavior == nil {
		t.Fatal("expected support behavior")
	}
	if supportBehavior.RespondInDM || supportBehavior.ProcessImages {
		t.Fatalf("expected routed support behavior, got %+v", supportBehavior)
	}

	defaultBehavior := contextual.ChannelBehaviorForContext(bus.InboundContext{
		Channel:  "telegram",
		ChatType: "direct",
	})
	if defaultBehavior == nil {
		t.Fatal("expected default behavior")
	}
	if !defaultBehavior.RespondInDM || !defaultBehavior.ProcessImages {
		t.Fatalf("expected default main behavior, got %+v", defaultBehavior)
	}
}
