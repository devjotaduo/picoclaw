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
