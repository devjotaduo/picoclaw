package agent

import (
	"testing"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/config"
)

func TestNewAgentLoopMarketingRegistersInstagramAssetToolsWhenEnabled(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Agents.Defaults.Workspace = t.TempDir()
	cfg.Tools.ImageGeneration.Enabled = true
	cfg.Tools.ImageGeneration.APIKey = *config.NewSecureString("test-image-key")
	cfg.Tools.SaveMarketingProposal.Enabled = true
	orchestrator.EnsureSpecialistConfig(cfg)

	al := NewAgentLoop(cfg, bus.NewMessageBus(), &mockProvider{})
	t.Cleanup(al.Close)

	marketing, ok := al.registry.GetAgent(orchestrator.AgentMarketing)
	if !ok {
		t.Fatal("marketing agent not registered")
	}
	if _, ok := marketing.Tools.Get("generate_image"); !ok {
		t.Fatal("marketing agent missing generate_image tool")
	}
	if _, ok := marketing.Tools.Get("save_marketing_proposal"); !ok {
		t.Fatal("marketing agent missing save_marketing_proposal tool")
	}
}

func TestResolveImageGenerationToolConfigUsesRegisteredModel(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.ModelList = append(cfg.ModelList, &config.ModelConfig{
		ModelName: "openrouter-image",
		Provider:  "openrouter",
		Model:     "google/gemini-2.5-flash-image",
		APIBase:   "https://openrouter.ai/api/v1",
		APIKeys:   config.SimpleSecureStrings("sk-or-test"),
	})
	cfg.Tools.ImageGeneration.Enabled = true
	cfg.Tools.ImageGeneration.Model = "openrouter-image"
	cfg.Tools.ImageGeneration.APIBase = "https://api.openai.com/v1"

	resolved := resolveImageGenerationToolConfig(cfg)
	if resolved.Model != "google/gemini-2.5-flash-image" {
		t.Fatalf("resolved model = %q, want OpenRouter image model", resolved.Model)
	}
	if resolved.APIBase != "https://openrouter.ai/api/v1" {
		t.Fatalf("resolved api base = %q, want OpenRouter API base", resolved.APIBase)
	}
	if resolved.APIKey.String() != "sk-or-test" {
		t.Fatal("expected image generation API key to come from registered model")
	}
}
