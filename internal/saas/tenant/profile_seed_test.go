package tenant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestApplyProfileSeedPreservesSecretsAndRuntimeState(t *testing.T) {
	seed := t.TempDir()
	volume := t.TempDir()

	mustWrite(t, filepath.Join(seed, "config.json"), []byte(`{
	  "model_list": [{"model_name": "default", "provider": "litellm", "model": "gpt-4o-mini"}],
	  "channel_list": {"telegram": {"enabled": true, "token": "seed-token"}}
	}`), 0o600)
	mustWrite(t, filepath.Join(seed, ".security.yml"), []byte(`model_list:
  default:
    api_keys:
      - seed-model-key
channels:
  telegram:
    token: seed-security-token
`), 0o600)
	mustWrite(t, filepath.Join(seed, "launcher-auth.db"), []byte("seed-auth"), 0o600)
	mustWrite(t, filepath.Join(seed, "litellm.key"), []byte("seed-key"), 0o600)
	mustWrite(t, filepath.Join(seed, "workspace", "AGENT.md"), []byte("seed-agent"), 0o644)
	mustWrite(t, filepath.Join(seed, "workspace", "memory", "state.json"), []byte("seed-memory"), 0o644)

	mustWrite(t, filepath.Join(volume, "config.json"), []byte(`{
	  "model_list": [{"model_name": "default", "api_keys": ["file://litellm.key"]}],
	  "channel_list": {"telegram": {"enabled": false, "token": "tenant-token"}}
	}`), 0o600)
	mustWrite(t, filepath.Join(volume, ".security.yml"), []byte(`model_list:
  default:
    api_keys:
      - tenant-model-key
channels:
  telegram:
    token: tenant-security-token
`), 0o600)
	mustWrite(t, filepath.Join(volume, "launcher-auth.db"), []byte("tenant-auth"), 0o600)
	mustWrite(t, filepath.Join(volume, "litellm.key"), []byte("tenant-key"), 0o600)
	mustWrite(t, filepath.Join(volume, "workspace", "memory", "state.json"), []byte("tenant-memory"), 0o644)

	backupDir, err := ApplyProfileSeed(seed, volume)
	if err != nil {
		t.Fatalf("ApplyProfileSeed: %v", err)
	}

	assertFile(t, filepath.Join(volume, "launcher-auth.db"), "tenant-auth")
	assertFile(t, filepath.Join(volume, "litellm.key"), "tenant-key")
	assertFile(t, filepath.Join(volume, "workspace", "memory", "state.json"), "tenant-memory")
	assertFile(t, filepath.Join(volume, "workspace", "AGENT.md"), "seed-agent")
	if _, err := os.Stat(filepath.Join(backupDir, "config.json")); err != nil {
		t.Fatalf("expected config backup: %v", err)
	}

	var cfg map[string]any
	b, err := os.ReadFile(filepath.Join(volume, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		t.Fatal(err)
	}
	models := cfg["model_list"].([]any)
	defaultModel := models[0].(map[string]any)
	if _, ok := defaultModel["api_keys"]; !ok {
		t.Fatal("default model api_keys were not preserved")
	}
	channels := cfg["channel_list"].(map[string]any)
	telegram := channels["telegram"].(map[string]any)
	if got := telegram["token"]; got != "tenant-token" {
		t.Fatalf("telegram token = %v, want tenant-token", got)
	}
	if got := telegram["enabled"]; got != true {
		t.Fatalf("telegram enabled = %v, want true from profile", got)
	}
	assertFile(t, filepath.Join(volume, ".security.yml"), `channels:
    telegram:
        token: tenant-security-token
model_list:
    default:
        api_keys:
            - tenant-model-key
`)
}

func TestSanitizeSeedRemovesSecuritySecrets(t *testing.T) {
	seed := t.TempDir()
	mustWrite(t, filepath.Join(seed, ".security.yml"), []byte(`model_list:
  default:
    api_keys:
      - should-not-copy
channels:
  telegram:
    token: should-not-copy
safe:
  note: keep
`), 0o600)

	if err := SanitizeSeed(seed); err != nil {
		t.Fatalf("SanitizeSeed: %v", err)
	}

	assertFile(t, filepath.Join(seed, ".security.yml"), `channels:
    telegram: {}
model_list:
    default: {}
safe:
    note: keep
`)
}

func TestSanitizeSeedPreservesOpenRouterSharedKeyRefs(t *testing.T) {
	seed := t.TempDir()
	mustWrite(t, filepath.Join(seed, "openrouter.key"), []byte("sk-or-shared"), 0o600)
	mustWrite(t, filepath.Join(seed, "litellm.key"), []byte("tenant-specific"), 0o600)
	mustWrite(t, filepath.Join(seed, "agents", "marketing", "openrouter.key"), []byte("sk-or-shared"), 0o600)
	mustWrite(t, filepath.Join(seed, "agents", "marketing", "other.key"), []byte("remove-me"), 0o600)
	mustWrite(t, filepath.Join(seed, "config.json"), []byte(`{
	  "model_list": [
	    {
	      "model_name": "openrouter-sonnet",
	      "provider": "openrouter",
	      "api_keys": ["file://openrouter.key", "sk-plain-should-go"]
	    },
	    {
	      "model_name": "plain",
	      "provider": "openai",
	      "api_key": "sk-plain-should-go"
	    }
	  ]
	}`), 0o600)
	mustWrite(t, filepath.Join(seed, ".security.yml"), []byte(`model_list:
  openrouter-sonnet:
    api_keys:
      - file://openrouter.key
      - sk-plain-should-go
channels:
  telegram:
    token: seed-security-token
`), 0o600)

	if err := SanitizeSeed(seed); err != nil {
		t.Fatalf("SanitizeSeed: %v", err)
	}

	assertFile(t, filepath.Join(seed, "openrouter.key"), "sk-or-shared")
	assertFile(t, filepath.Join(seed, "agents", "marketing", "openrouter.key"), "sk-or-shared")
	if _, err := os.Stat(filepath.Join(seed, "litellm.key")); !os.IsNotExist(err) {
		t.Fatalf("litellm.key should be removed, stat err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(seed, "agents", "marketing", "other.key")); !os.IsNotExist(err) {
		t.Fatalf("other.key should be removed, stat err = %v", err)
	}

	var cfg map[string]any
	b, err := os.ReadFile(filepath.Join(seed, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		t.Fatal(err)
	}
	models := cfg["model_list"].([]any)
	openrouter := models[0].(map[string]any)
	keys := openrouter["api_keys"].([]any)
	if len(keys) != 1 || keys[0] != "file://openrouter.key" {
		t.Fatalf("openrouter api_keys = %#v, want only file://openrouter.key", keys)
	}
	plain := models[1].(map[string]any)
	if _, ok := plain["api_key"]; ok {
		t.Fatalf("plain api_key should be removed, got %#v", plain["api_key"])
	}
	assertFile(t, filepath.Join(seed, ".security.yml"), `channels:
    telegram: {}
model_list:
    openrouter-sonnet:
        api_keys:
            - file://openrouter.key
`)
}

func mustWrite(t *testing.T, path string, b []byte, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, b, mode); err != nil {
		t.Fatal(err)
	}
}

func assertFile(t *testing.T, path, want string) {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != want {
		t.Fatalf("%s = %q, want %q", path, string(b), want)
	}
}
