package api

import (
	"reflect"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

func TestTenantModelRoutingStoreRowRoundTrip(t *testing.T) {
	cfg := &tenant.ModelRoutingConfig{
		Mode: "litellm",
		LiteLLM: tenant.LiteLLMModelRoutingConfig{
			ModelName:     "gpt-4o-mini",
			APIBase:       "http://litellm:4000",
			Fallbacks:     []string{"claude-haiku-4-5"},
			AllowedModels: []string{"gpt-4o-mini", "claude-haiku-4-5"},
		},
		CLI: tenant.CLIModelRoutingConfig{
			Order:       []string{"codex-cli", "claude-cli"},
			ClaudeModel: "haiku",
			CodexModel:  "gpt-5.3-codex",
		},
	}

	row := tenantModelRoutingStoreRow("tenant-1", cfg)
	if row.TenantID != "tenant-1" || row.Mode != "litellm" {
		t.Fatalf("unexpected row: %+v", row)
	}
	got := tenantModelRoutingConfigFromStore(row)
	if got.Mode != cfg.Mode ||
		got.LiteLLM.ModelName != cfg.LiteLLM.ModelName ||
		got.LiteLLM.APIBase != cfg.LiteLLM.APIBase ||
		!reflect.DeepEqual(got.LiteLLM.Fallbacks, cfg.LiteLLM.Fallbacks) ||
		!reflect.DeepEqual(got.LiteLLM.AllowedModels, cfg.LiteLLM.AllowedModels) ||
		!reflect.DeepEqual(got.CLI.Order, cfg.CLI.Order) ||
		got.CLI.ClaudeModel != cfg.CLI.ClaudeModel ||
		got.CLI.CodexModel != cfg.CLI.CodexModel {
		t.Fatalf("roundtrip mismatch\ngot:  %+v\nwant: %+v", got, cfg)
	}
}

func TestTenantModelRoutingResponseFromStoreMasksMissingRowAsAuto(t *testing.T) {
	out := tenantModelRoutingResponseFromStore(nil)
	if out.Mode != "auto" {
		t.Fatalf("mode = %q, want auto", out.Mode)
	}

	out = tenantModelRoutingResponseFromStore(&store.TenantModelRouting{
		Mode:           "cli",
		CLIOrder:       []string{"claude-cli"},
		CLIClaudeModel: "sonnet",
	})
	if out.Mode != "cli" ||
		!reflect.DeepEqual(out.CLI.Order, []string{"claude-cli"}) ||
		out.CLI.ClaudeModel != "sonnet" {
		t.Fatalf("unexpected response: %+v", out)
	}
}
