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
    "public-web": {"enabled": true}
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
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
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

func TestEnsurePublicWebChannelConfigAddsMissingChannel(t *testing.T) {
	dst := t.TempDir()
	path := filepath.Join(dst, "config.json")
	if err := os.WriteFile(path, []byte(`{"version":3,"channel_list":{}}`+"\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	if err := EnsurePublicWebChannelConfig(dst); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o640 {
		got := info.Mode().Perm()
		t.Fatalf("mode = %v, want 0640", got)
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
	channels := cfg["channel_list"].(map[string]any)
	publicWeb := channels["public-web"].(map[string]any)
	if publicWeb["type"] != "public-web" || publicWeb["enabled"] != true {
		t.Fatalf("public-web channel not enabled correctly: %#v", publicWeb)
	}
	settings := publicWeb["settings"].(map[string]any)
	if settings["rate_limit_per_ip"] != float64(30) ||
		settings["session_ttl_seconds"] != float64(1800) ||
		settings["require_captcha_header"] != true {
		t.Fatalf("unexpected public-web settings: %#v", settings)
	}
}

func TestEnsurePublicWebChannelConfigPreservesExistingSettingsAndLegacyChannelsKey(t *testing.T) {
	dst := t.TempDir()
	path := filepath.Join(dst, "config.json")
	if err := os.WriteFile(path, []byte(`{
  "channels": {
    "public-web": {
      "type": "public-web",
      "enabled": false,
      "settings": {
        "rate_limit_per_ip": 9
      }
    }
  }
}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := EnsurePublicWebChannelConfig(dst); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	if _, ok := cfg["channel_list"]; ok {
		t.Fatal("legacy config should keep using channels so version-0 migration does not overwrite the patch")
	}
	publicWeb := cfg["channels"].(map[string]any)["public-web"].(map[string]any)
	if publicWeb["enabled"] != true {
		t.Fatalf("public-web should be forced enabled: %#v", publicWeb)
	}
	settings := publicWeb["settings"].(map[string]any)
	if settings["rate_limit_per_ip"] != float64(9) {
		t.Fatalf("existing rate limit was overwritten: %#v", settings)
	}
	if settings["session_ttl_seconds"] != float64(1800) {
		t.Fatalf("missing ttl default was not added: %#v", settings)
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
