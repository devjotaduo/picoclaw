package tenant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestCopyWorkspaceHome verifies the workspace home subtree lands in the
// tenant volume verbatim, mode bits preserved, with nested directories
// created on demand. This is the only copy step in the new provisioning
// flow — if it diverges from the on-disk layout the operator sees, every
// downstream debug becomes confusing.
func TestCopyWorkspaceHome(t *testing.T) {
	wsRoot := t.TempDir()
	homeSrc := filepath.Join(wsRoot, WorkspaceHomeSubdir)

	files := map[string]string{
		"config.json":                     `{"model_list":[{"api_key":"${LITELLM_KEY}"}]}`,
		".security.yml":                   "permissions: []",
		"workspace/AGENT.md":              "# Clara\n",
		"workspace/SOUL.md":               "voz: BR-PT",
		"workspace/agents/sofia/AGENT.md": "# Sofia",
	}
	for rel, content := range files {
		path := filepath.Join(homeSrc, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("setup mkdir %s: %v", rel, err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("setup write %s: %v", rel, err)
		}
	}

	dst := filepath.Join(t.TempDir(), "tenant-vol")
	if err := CopyWorkspaceHome(wsRoot, dst); err != nil {
		t.Fatalf("CopyWorkspaceHome: %v", err)
	}

	for rel, want := range files {
		got, err := os.ReadFile(filepath.Join(dst, rel))
		if err != nil {
			t.Errorf("missing %s: %v", rel, err)
			continue
		}
		if string(got) != want {
			t.Errorf("content mismatch for %s: got %q, want %q", rel, got, want)
		}
	}
}

func TestCopyWorkspaceHome_MissingHomeDir(t *testing.T) {
	// A workspace without a home/ subdir is a broken workspace — surface
	// the error rather than silently creating an empty tenant.
	if err := CopyWorkspaceHome(t.TempDir(), filepath.Join(t.TempDir(), "tenant")); err == nil {
		t.Fatal("expected error when home/ is missing, got nil")
	}
}

// TestSubstituteConfigPlaceholders confirms that the placeholder in
// config.json is replaced with the real LiteLLM key and that
// non-placeholder files outside placeholderFiles are NOT scanned (so a
// binary file like dashboardauth.db can't be corrupted by a stray byte
// sequence matching a placeholder).
func TestSubstituteConfigPlaceholders(t *testing.T) {
	dst := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dst, "workspace"), 0o755); err != nil {
		t.Fatal(err)
	}

	must := func(rel, content string) {
		t.Helper()
		path := filepath.Join(dst, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	must("config.json", `{"api_key":"${LITELLM_KEY}","tenant":"${TENANT_ID}"}`)
	must(".security.yml", "permissions: ${LITELLM_KEY}")
	// A "binary" file that happens to contain the placeholder string but
	// lives OUTSIDE placeholderFiles — must NOT be modified.
	must("workspace/skills/raw/data.bin", "irrelevant ${LITELLM_KEY} bytes")

	err := SubstituteConfigPlaceholders(dst, map[string]string{
		"${LITELLM_KEY}": "sk-real-key-12345",
		"${TENANT_ID}":   "t-abcdef",
	})
	if err != nil {
		t.Fatalf("SubstituteConfigPlaceholders: %v", err)
	}

	cfg, _ := os.ReadFile(filepath.Join(dst, "config.json"))
	if want := `{"api_key":"sk-real-key-12345","tenant":"t-abcdef"}`; string(cfg) != want {
		t.Errorf("config.json: got %q, want %q", cfg, want)
	}

	sec, _ := os.ReadFile(filepath.Join(dst, ".security.yml"))
	if !strings.Contains(string(sec), "sk-real-key-12345") {
		t.Errorf(".security.yml not substituted: %q", sec)
	}

	bin, _ := os.ReadFile(filepath.Join(dst, "workspace/skills/raw/data.bin"))
	if !strings.Contains(string(bin), "${LITELLM_KEY}") {
		t.Errorf(
			"data.bin was unexpectedly substituted — placeholder scan must be limited to known config files: %q",
			bin,
		)
	}
}

// TestSubstituteConfigPlaceholders_MissingFileIsOk tests the fact that a
// workspace doesn't have to ship every optional config file. Skipping
// missing ones lets the provisioner stay generic.
func TestSubstituteConfigPlaceholders_MissingFileIsOk(t *testing.T) {
	dst := t.TempDir()
	if err := os.WriteFile(filepath.Join(dst, "config.json"), []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := SubstituteConfigPlaceholders(dst, map[string]string{"${X}": "y"}); err != nil {
		t.Fatalf("expected nil for workspace with only config.json, got %v", err)
	}
}

func TestSubstituteRedactedModelKeysOnlyTouchesModelList(t *testing.T) {
	dst := t.TempDir()
	path := filepath.Join(dst, ".security.yml")
	if err := os.WriteFile(path, []byte(`model_list:
  openrouter-gpt-5.4:0:
    api_keys:
      - REDACTED
      - keep-me
web:
  brave:
    api_keys:
      - REDACTED
channel_list:
  pico:
    settings:
      token: REDACTED
`), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := SubstituteRedactedModelKeys(dst, "sk-litellm-e2e"); err != nil {
		t.Fatalf("SubstituteRedactedModelKeys: %v", err)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(got)
	if !strings.Contains(text, "sk-litellm-e2e") {
		t.Fatalf("model_list REDACTED key was not replaced:\n%s", text)
	}
	if !strings.Contains(text, "keep-me") {
		t.Fatalf("existing non-redacted model key was lost:\n%s", text)
	}
	if strings.Count(text, "REDACTED") != 2 {
		t.Fatalf("non-model REDACTED values should remain untouched:\n%s", text)
	}
}

func TestApplySaaSLiteLLMModelRoutingMaterializesTenantModel(t *testing.T) {
	dst := t.TempDir()
	path := filepath.Join(dst, "config.json")
	if err := os.WriteFile(path, []byte(`{
  "version": 3,
  "agents": {
    "defaults": {
      "workspace": "/root/.picoclaw/workspace",
      "provider": "openrouter",
      "model_name": "openrouter-gpt-5.4"
    }
  },
  "channel_list": {
    "whatsapp_native": {"enabled": true}
  },
  "model_list": [
    {
      "model_name": "openrouter-gpt-5.4",
      "provider": "openrouter",
      "model": "openai/gpt-5.4",
      "api_base": "https://openrouter.ai/api/v1"
    }
  ]
}
`), 0o640); err != nil {
		t.Fatal(err)
	}

	if err := ApplySaaSLiteLLMModelRouting(dst, "gpt-4o-mini", "http://litellm:4000", "sk-tenant-key"); err != nil {
		t.Fatalf("ApplySaaSLiteLLMModelRouting: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o640 {
		t.Fatalf("mode = %v, want 0640", info.Mode().Perm())
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(string(raw), "\n") {
		t.Fatal("expected trailing newline to be preserved")
	}

	var cfg map[string]any
	if decodeErr := json.Unmarshal(raw, &cfg); decodeErr != nil {
		t.Fatal(decodeErr)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if defaults["provider"] != "litellm" || defaults["model_name"] != "gpt-4o-mini" {
		t.Fatalf("defaults not routed to LiteLLM: %#v", defaults)
	}
	models := cfg["model_list"].([]any)
	if len(models) != 1 {
		t.Fatalf("model_list len = %d, want 1", len(models))
	}
	model := models[0].(map[string]any)
	if model["model_name"] != "gpt-4o-mini" ||
		model["provider"] != "openai" ||
		model["model"] != "gpt-4o-mini" ||
		model["api_base"] != "http://litellm:4000" ||
		model["enabled"] != true {
		t.Fatalf("model not materialized for LiteLLM: %#v", model)
	}
	keys := model["api_keys"].([]any)
	if len(keys) != 1 || keys[0] != "sk-tenant-key" {
		t.Fatalf("api_keys = %#v, want tenant key", keys)
	}
	if _, ok := cfg["channel_list"]; !ok {
		t.Fatal("unrelated channel_list was lost")
	}
}

func TestApplySaaSLiteLLMModelRoutingWithFallbacksMaterializesOrder(t *testing.T) {
	dst := t.TempDir()
	path := writeTenantRoutingConfig(t, dst)

	if err := ApplySaaSLiteLLMModelRoutingWithFallbacks(
		dst,
		"gpt-4o-mini",
		[]string{"claude-haiku-4-5", "deepseek-chat"},
		"http://litellm:4000",
		"sk-tenant-key",
	); err != nil {
		t.Fatalf("ApplySaaSLiteLLMModelRoutingWithFallbacks: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if defaults["provider"] != "litellm" || defaults["model_name"] != "gpt-4o-mini" {
		t.Fatalf("defaults not routed to LiteLLM primary: %#v", defaults)
	}
	defaultFallbacks := defaults["model_fallbacks"].([]any)
	if len(defaultFallbacks) != 2 || defaultFallbacks[0] != "claude-haiku-4-5" ||
		defaultFallbacks[1] != "deepseek-chat" {
		t.Fatalf("defaults model_fallbacks = %#v", defaultFallbacks)
	}

	models := cfg["model_list"].([]any)
	if len(models) != 3 {
		t.Fatalf("model_list len = %d, want 3", len(models))
	}
	for i, want := range []string{"gpt-4o-mini", "claude-haiku-4-5", "deepseek-chat"} {
		model := models[i].(map[string]any)
		if model["model_name"] != want || model["model"] != want || model["api_base"] != "http://litellm:4000" {
			t.Fatalf("model[%d] = %#v", i, model)
		}
		keys := model["api_keys"].([]any)
		if len(keys) != 1 || keys[0] != "sk-tenant-key" {
			t.Fatalf("model[%d].api_keys = %#v", i, keys)
		}
	}
	primaryFallbacks := models[0].(map[string]any)["fallbacks"].([]any)
	if len(primaryFallbacks) != 2 || primaryFallbacks[0] != "claude-haiku-4-5" ||
		primaryFallbacks[1] != "deepseek-chat" {
		t.Fatalf("primary fallbacks = %#v", primaryFallbacks)
	}
}

func TestApplySaaSCLIModelRoutingPrefersClaudeWithCodexFallback(t *testing.T) {
	dst := t.TempDir()
	path := writeTenantRoutingConfig(t, dst)
	securityPath := filepath.Join(dst, ".security.yml")
	if err := os.WriteFile(securityPath, []byte(`model_list:
  openrouter-gpt-5.4:0:
    api_keys:
      - REDACTED
channel_list:
  whatsapp_native:
    settings:
      token: keep-me
`), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ApplySaaSCLIModelRouting(dst, true, true); err != nil {
		t.Fatalf("ApplySaaSCLIModelRouting: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(string(raw), "\n") {
		t.Fatal("expected trailing newline to be preserved")
	}

	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if defaults["provider"] != "claude-cli" || defaults["model_name"] != "claude-cli-sonnet" {
		t.Fatalf("defaults not routed to claude-cli: %#v", defaults)
	}
	defaultFallbacks := defaults["model_fallbacks"].([]any)
	if len(defaultFallbacks) != 1 || defaultFallbacks[0] != "codex-cli-gpt-5" {
		t.Fatalf("defaults model_fallbacks = %#v, want codex-cli-gpt-5", defaultFallbacks)
	}
	if _, ok := cfg["channel_list"]; !ok {
		t.Fatal("unrelated channel_list was lost")
	}
	securityRaw, err := os.ReadFile(securityPath)
	if err != nil {
		t.Fatal(err)
	}
	securityText := string(securityRaw)
	if strings.Contains(securityText, "model_list:") {
		t.Fatalf(".security.yml model_list must not override CLI routing:\n%s", securityText)
	}
	if !strings.Contains(securityText, "token: keep-me") {
		t.Fatalf(".security.yml unrelated channel secrets were lost:\n%s", securityText)
	}

	models := cfg["model_list"].([]any)
	if len(models) != 2 {
		t.Fatalf("model_list len = %d, want 2", len(models))
	}
	claude := models[0].(map[string]any)
	if claude["model_name"] != "claude-cli-sonnet" ||
		claude["provider"] != "claude-cli" ||
		claude["model"] != "sonnet" ||
		claude["workspace"] != "/root/.picoclaw/workspace" ||
		claude["enabled"] != true {
		t.Fatalf("claude-cli model not materialized: %#v", claude)
	}
	if _, ok := claude["api_keys"]; ok {
		t.Fatalf("claude-cli model must not carry api_keys: %#v", claude)
	}
	if _, ok := claude["api_base"]; ok {
		t.Fatalf("claude-cli model must not carry api_base: %#v", claude)
	}
	fallbacks := claude["fallbacks"].([]any)
	if len(fallbacks) != 1 || fallbacks[0] != "codex-cli-gpt-5" {
		t.Fatalf("claude-cli fallbacks = %#v, want codex-cli-gpt-5", fallbacks)
	}

	codex := models[1].(map[string]any)
	if codex["model_name"] != "codex-cli-gpt-5" ||
		codex["provider"] != "codex-cli" ||
		codex["model"] != "codex-cli" ||
		codex["workspace"] != "/root/.picoclaw/workspace" ||
		codex["enabled"] != true {
		t.Fatalf("codex-cli fallback model not materialized: %#v", codex)
	}
	if _, ok := codex["api_keys"]; ok {
		t.Fatalf("codex-cli model must not carry api_keys: %#v", codex)
	}
	if _, ok := codex["api_base"]; ok {
		t.Fatalf("codex-cli model must not carry api_base: %#v", codex)
	}
}

func TestApplySaaSCLIModelRoutingFromOrderSupportsCodexFirst(t *testing.T) {
	dst := t.TempDir()
	path := writeTenantRoutingConfig(t, dst)

	if err := ApplySaaSCLIModelRoutingFromOrder(dst, []string{"codex-cli", "claude-cli"}); err != nil {
		t.Fatalf("ApplySaaSCLIModelRoutingFromOrder: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if defaults["provider"] != "codex-cli" || defaults["model_name"] != "codex-cli-gpt-5" {
		t.Fatalf("defaults not routed to codex-cli: %#v", defaults)
	}
	defaultFallbacks := defaults["model_fallbacks"].([]any)
	if len(defaultFallbacks) != 1 || defaultFallbacks[0] != "claude-cli-sonnet" {
		t.Fatalf("defaults model_fallbacks = %#v, want claude-cli-sonnet", defaultFallbacks)
	}

	models := cfg["model_list"].([]any)
	if len(models) != 2 {
		t.Fatalf("model_list len = %d, want 2", len(models))
	}
	codex := models[0].(map[string]any)
	if codex["model_name"] != "codex-cli-gpt-5" || codex["provider"] != "codex-cli" {
		t.Fatalf("first model should be codex-cli, got %#v", codex)
	}
	fallbacks := codex["fallbacks"].([]any)
	if len(fallbacks) != 1 || fallbacks[0] != "claude-cli-sonnet" {
		t.Fatalf("codex fallbacks = %#v, want claude-cli-sonnet", fallbacks)
	}
	claude := models[1].(map[string]any)
	if claude["model_name"] != "claude-cli-sonnet" || claude["provider"] != "claude-cli" {
		t.Fatalf("second model should be claude-cli, got %#v", claude)
	}
	if _, ok := claude["fallbacks"]; ok {
		t.Fatalf("last fallback model must not carry fallbacks: %#v", claude)
	}
}

func TestApplySaaSCLIModelRoutingSupportsCodexOnly(t *testing.T) {
	dst := t.TempDir()
	path := writeTenantRoutingConfig(t, dst)

	if err := ApplySaaSCLIModelRouting(dst, false, true); err != nil {
		t.Fatalf("ApplySaaSCLIModelRouting: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if defaults["provider"] != "codex-cli" || defaults["model_name"] != "codex-cli-gpt-5" {
		t.Fatalf("defaults not routed to codex-cli: %#v", defaults)
	}
	if _, ok := defaults["model_fallbacks"]; ok {
		t.Fatalf("codex-only defaults must not carry stale model_fallbacks: %#v", defaults)
	}
	models := cfg["model_list"].([]any)
	if len(models) != 1 {
		t.Fatalf("model_list len = %d, want 1", len(models))
	}
	codex := models[0].(map[string]any)
	if codex["model_name"] != "codex-cli-gpt-5" ||
		codex["provider"] != "codex-cli" ||
		codex["model"] != "codex-cli" ||
		codex["workspace"] != "/root/.picoclaw/workspace" ||
		codex["enabled"] != true {
		t.Fatalf("codex-cli model not materialized: %#v", codex)
	}
	if _, ok := codex["fallbacks"]; ok {
		t.Fatalf("codex-only model must not carry fallbacks: %#v", codex)
	}
	if _, ok := codex["api_keys"]; ok {
		t.Fatalf("codex-cli model must not carry api_keys: %#v", codex)
	}
}

func TestApplySaaSCLIModelRoutingSupportsClaudeOnly(t *testing.T) {
	dst := t.TempDir()
	path := writeTenantRoutingConfig(t, dst)

	if err := ApplySaaSCLIModelRouting(dst, true, false); err != nil {
		t.Fatalf("ApplySaaSCLIModelRouting: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if defaults["provider"] != "claude-cli" || defaults["model_name"] != "claude-cli-sonnet" {
		t.Fatalf("defaults not routed to claude-cli: %#v", defaults)
	}
	if _, ok := defaults["model_fallbacks"]; ok {
		t.Fatalf("claude-only defaults must not carry stale model_fallbacks: %#v", defaults)
	}
	models := cfg["model_list"].([]any)
	if len(models) != 1 {
		t.Fatalf("model_list len = %d, want 1", len(models))
	}
	claude := models[0].(map[string]any)
	if claude["model_name"] != "claude-cli-sonnet" ||
		claude["provider"] != "claude-cli" ||
		claude["model"] != "sonnet" ||
		claude["workspace"] != "/root/.picoclaw/workspace" ||
		claude["enabled"] != true {
		t.Fatalf("claude-cli model not materialized: %#v", claude)
	}
	if _, ok := claude["fallbacks"]; ok {
		t.Fatalf("claude-only model must not carry fallbacks: %#v", claude)
	}
}

func TestApplySaaSCLIModelRoutingRejectsEmptySelection(t *testing.T) {
	dst := t.TempDir()
	writeTenantRoutingConfig(t, dst)

	if err := ApplySaaSCLIModelRouting(dst, false, false); err == nil {
		t.Fatal("expected error when neither CLI provider is enabled")
	}
}

func writeTenantRoutingConfig(t *testing.T, dst string) string {
	t.Helper()
	path := filepath.Join(dst, "config.json")
	if err := os.WriteFile(path, []byte(`{
  "version": 3,
  "agents": {
    "defaults": {
      "workspace": "/root/.picoclaw/workspace",
      "provider": "openrouter",
      "model_name": "openrouter-gpt-5.4",
      "model_fallbacks": ["legacy-openrouter-fallback"]
    }
  },
  "channel_list": {
    "whatsapp_native": {"enabled": true}
  },
  "model_list": [
    {
      "model_name": "openrouter-gpt-5.4",
      "provider": "openrouter",
      "model": "openai/gpt-5.4",
      "api_base": "https://openrouter.ai/api/v1",
      "api_keys": ["REDACTED"]
    }
  ]
}
`), 0o640); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestSanitizeTenantSecurityConfigRemovesLegacyAllowedChannels(t *testing.T) {
	dst := t.TempDir()
	path := filepath.Join(dst, ".security.yml")
	if err := os.WriteFile(
		path,
		[]byte("channels:\n  allowed: []\ntools:\n  exec:\n    enabled: false\n"),
		0o600,
	); err != nil {
		t.Fatal(err)
	}

	if err := SanitizeTenantSecurityConfig(dst); err != nil {
		t.Fatal(err)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(got)
	if strings.Contains(text, "allowed:") || strings.Contains(text, "channels:") {
		t.Fatalf("legacy channels block was not removed:\n%s", text)
	}
	if !strings.Contains(text, "tools:") {
		t.Fatalf("unrelated security config was lost:\n%s", text)
	}
}

func TestHasBuiltFrontend(t *testing.T) {
	ws := t.TempDir()
	if HasBuiltFrontend(ws) {
		t.Fatal("expected false for empty workspace")
	}
	distDir := filepath.Join(ws, WorkspaceFrontendDistSubdir)
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Empty file still counts as not-built (zero size).
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte{}, 0o644); err != nil {
		t.Fatal(err)
	}
	if HasBuiltFrontend(ws) {
		t.Fatal("expected false for zero-byte index.html")
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !HasBuiltFrontend(ws) {
		t.Fatal("expected true when index.html is non-empty")
	}
}
