package tenant

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	_ "modernc.org/sqlite"
)

// TestSeedDashboardPassword guarantees the seeded DB matches the exact schema
// and bcrypt cost that picoclaw's dashboardauth.Store expects. Any drift here
// causes silent first-login failures for every newly-provisioned tenant.
func TestSeedDashboardPassword(t *testing.T) {
	dir := t.TempDir()
	const password = "correct-horse-battery-staple"

	if err := SeedDashboardPassword(context.Background(), dir, password); err != nil {
		t.Fatalf("seed: %v", err)
	}

	dbPath := filepath.Join(dir, DBFilename)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	// Schema matches picoclaw verbatim: table name, columns, CHECK(id=1).
	const expectSchema = "CREATE TABLE dashboard_credentials (\n\t\t\tid          INTEGER PRIMARY KEY CHECK (id = 1),\n\t\t\tbcrypt_hash TEXT    NOT NULL\n\t\t)"
	var schema string
	if err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='dashboard_credentials'`).Scan(&schema); err != nil {
		t.Fatalf("schema query: %v", err)
	}
	if schema != expectSchema {
		t.Errorf("schema drift detected.\nwant: %q\ngot:  %q", expectSchema, schema)
	}

	// Exactly one row at id=1.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM dashboard_credentials WHERE id = 1`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("want exactly 1 row at id=1, got %d", count)
	}

	// Hash verifies against the original plaintext (i.e. bcrypt cost matches).
	var hash string
	if err := db.QueryRow(`SELECT bcrypt_hash FROM dashboard_credentials WHERE id = 1`).Scan(&hash); err != nil {
		t.Fatalf("scan hash: %v", err)
	}
	if !auth.VerifyPassword(hash, password) {
		t.Errorf("seeded hash does not verify against original password")
	}
	if auth.VerifyPassword(hash, "wrong-password") {
		t.Errorf("seeded hash incorrectly verifies a wrong password")
	}
}

func TestSeedDashboardPassword_Reseed(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()

	if err := SeedDashboardPassword(ctx, dir, "first"); err != nil {
		t.Fatalf("seed1: %v", err)
	}
	if err := SeedDashboardPassword(ctx, dir, "second"); err != nil {
		t.Fatalf("seed2: %v", err)
	}

	db, err := sql.Open("sqlite", filepath.Join(dir, DBFilename))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	var hash string
	if err := db.QueryRow(`SELECT bcrypt_hash FROM dashboard_credentials WHERE id = 1`).Scan(&hash); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if auth.VerifyPassword(hash, "first") {
		t.Error("old password should no longer verify after reseed")
	}
	if !auth.VerifyPassword(hash, "second") {
		t.Error("new password does not verify after reseed")
	}
}

func TestSeedPicoConfigPreservesProfileDefaultModel(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{
	  "agents": {"defaults": {"provider": "litellm", "model_name": "support"}},
	  "model_list": [
	    {"model_name": "support", "provider": "litellm", "model": "gpt-4o-mini"},
	    {"model_name": "dev", "provider": "openrouter", "model": "anthropic/claude-sonnet-4.5"}
	  ]
	}`), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := SeedPicoConfig(context.Background(), dir, "http://litellm:4000", "sk-tenant"); err != nil {
		t.Fatalf("SeedPicoConfig: %v", err)
	}

	var cfg map[string]any
	b, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		t.Fatal(err)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if got := defaults["model_name"]; got != "support" {
		t.Fatalf("model_name = %v, want support", got)
	}
	models := cfg["model_list"].([]any)
	support := models[0].(map[string]any)
	if got := support["api_base"]; got != "http://litellm:4000/v1" {
		t.Fatalf("support api_base = %v", got)
	}
	if keys, ok := support["api_keys"].([]any); !ok || len(keys) != 1 || keys[0] != "file://litellm.key" {
		t.Fatalf("support api_keys = %#v, want file://litellm.key", support["api_keys"])
	}
	dev := models[1].(map[string]any)
	if _, ok := dev["api_keys"]; ok {
		t.Fatalf("non-LiteLLM model should not receive tenant litellm key: %#v", dev)
	}
	channels := cfg["channel_list"].(map[string]any)
	whatsapp := channels["whatsapp"].(map[string]any)
	if got := whatsapp["enabled"]; got != true {
		t.Fatalf("whatsapp enabled = %#v, want true", got)
	}
	if got := whatsapp["type"]; got != "whatsapp_native" {
		t.Fatalf("whatsapp type = %#v, want whatsapp_native", got)
	}
	settings := whatsapp["settings"].(map[string]any)
	if got := settings["use_native"]; got != true {
		t.Fatalf("whatsapp use_native = %#v, want true", got)
	}
	if got := settings["bridge_url"]; got != "" {
		t.Fatalf("whatsapp bridge_url = %#v, want empty", got)
	}
}

func TestSeedPicoConfigFallsBackWhenProfileDefaultHasNoCredential(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{
	  "agents": {"defaults": {"provider": "qwen-intl", "model_name": "qwen-plus"}},
	  "model_list": [
	    {"model_name": "qwen-plus", "provider": "qwen-intl", "model": "qwen-plus", "api_base": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"}
	  ]
	}`), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := SeedPicoConfig(context.Background(), dir, "http://litellm:4000", "sk-tenant"); err != nil {
		t.Fatalf("SeedPicoConfig: %v", err)
	}

	var cfg map[string]any
	b, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		t.Fatal(err)
	}
	defaults := cfg["agents"].(map[string]any)["defaults"].(map[string]any)
	if got := defaults["provider"]; got != "litellm" {
		t.Fatalf("provider = %v, want litellm", got)
	}
	if got := defaults["model_name"]; got != "default" {
		t.Fatalf("model_name = %v, want default fallback", got)
	}

	var fallback map[string]any
	for _, item := range cfg["model_list"].([]any) {
		m := item.(map[string]any)
		if m["model_name"] == "default" {
			fallback = m
			break
		}
	}
	if fallback == nil {
		t.Fatal("missing default LiteLLM fallback model")
	}
	if keys, ok := fallback["api_keys"].([]any); !ok || len(keys) != 1 || keys[0] != "file://litellm.key" {
		t.Fatalf("fallback api_keys = %#v, want file://litellm.key", fallback["api_keys"])
	}
}
