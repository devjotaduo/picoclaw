package main

import "testing"

func TestSplitCSVTrimsDropsEmptyAndDeduplicates(t *testing.T) {
	got := splitCSV(" claude-cli, codex-cli, claude-cli, ,")
	want := []string{"claude-cli", "codex-cli"}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got[%d] = %q, want %q (%v)", i, got[i], want[i], got)
		}
	}
}

func TestTenantRoutingConfigFromFlagsLiteLLM(t *testing.T) {
	cfg, rowFn, err := tenantRoutingConfigFromFlags(
		"litellm",
		"gpt-4o-mini",
		"http://litellm:4000",
		"fallback-a,fallback-b",
		"gpt-4o-mini,fallback-a",
		"",
	)
	if err != nil {
		t.Fatalf("tenantRoutingConfigFromFlags: %v", err)
	}
	if cfg.Mode != "litellm" {
		t.Fatalf("mode = %q, want litellm", cfg.Mode)
	}
	if cfg.LiteLLM.ModelName != "gpt-4o-mini" {
		t.Fatalf("model = %q", cfg.LiteLLM.ModelName)
	}
	row := rowFn("tenant-1")
	if row.TenantID != "tenant-1" || row.Mode != "litellm" {
		t.Fatalf("unexpected row: %+v", row)
	}
	if len(row.LiteLLMFallbacks) != 2 || row.LiteLLMFallbacks[1] != "fallback-b" {
		t.Fatalf("fallbacks = %#v", row.LiteLLMFallbacks)
	}
}

func TestTenantRoutingConfigFromFlagsRejectsUnknownMode(t *testing.T) {
	if _, _, err := tenantRoutingConfigFromFlags("other", "", "", "", "", ""); err == nil {
		t.Fatal("expected unknown mode error")
	}
}
