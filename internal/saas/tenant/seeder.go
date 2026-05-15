package tenant

// Seeder pre-populates the picoclaw launcher dashboard auth SQLite database
// before the tenant container starts, so the tenant never sees the public
// /launcher-setup screen.
//
// The schema and bcrypt cost MUST match
//   picoclaw/web/backend/dashboardauth/sql.go
//   picoclaw/web/backend/dashboardauth/store.go
// exactly. Any drift breaks first-login.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	_ "modernc.org/sqlite"
)

// DBFilename mirrors picoclaw's dashboardauth.DBFilename.
const DBFilename = "launcher-auth.db"

const (
	sqlCreateTable = `
		CREATE TABLE IF NOT EXISTS dashboard_credentials (
			id          INTEGER PRIMARY KEY CHECK (id = 1),
			bcrypt_hash TEXT    NOT NULL
		)`

	sqlUpsertHash = `
		INSERT INTO dashboard_credentials (id, bcrypt_hash) VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET bcrypt_hash = excluded.bcrypt_hash`
)

// SeedPicoConfig writes a minimal picoclaw config.json to volumeDir so the
// agent is pre-configured to use LiteLLM with the tenant's virtual key.
// The key is written to litellm.key and referenced as file://litellm.key so
// the plaintext never lives inside a human-readable JSON field.
// No-op when llmKey is empty (LiteLLM integration disabled). When a template
// already includes config.json, this merges the required LiteLLM defaults
// instead of trusting the template to point at the tenant-scoped virtual key.
func SeedPicoConfig(_ context.Context, volumeDir, litellmBase, llmKey string) error {
	if llmKey == "" {
		return nil
	}

	keyPath := filepath.Join(volumeDir, "litellm.key")
	if err := os.WriteFile(keyPath, []byte(llmKey), 0o600); err != nil {
		return fmt.Errorf("write litellm.key: %w", err)
	}

	cfgPath := filepath.Join(volumeDir, "config.json")
	cfg := defaultPicoConfig(litellmBase)
	if data, err := os.ReadFile(cfgPath); err == nil {
		if len(data) > 0 {
			if err := json.Unmarshal(data, &cfg); err != nil {
				return fmt.Errorf("parse config.json: %w", err)
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read config.json: %w", err)
	}

	mergeLiteLLMDefaults(cfg, litellmBase)

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(cfgPath, data, 0o600); err != nil {
		return fmt.Errorf("write config.json: %w", err)
	}
	return nil
}

func defaultPicoConfig(litellmBase string) map[string]any {
	return map[string]any{
		"version": 3,
		"agents": map[string]any{
			"defaults": map[string]any{
				"workspace":                    "/root/.picoclaw/workspace",
				"restrict_to_workspace":        true,
				"allow_read_outside_workspace": false,
				"provider":                     "litellm",
				"model_name":                   "default",
				"max_tokens":                   16384,
				"max_tool_iterations":          50,
				"summarize_message_threshold":  20,
				"summarize_token_percent":      75,
				"steering_mode":                "one-at-a-time",
				"max_llm_retries":              2,
				"llm_retry_backoff_secs":       2,
			},
		},
		"model_list": []map[string]any{
			{
				"model_name": "default",
				"provider":   "litellm",
				"model":      "gpt-4o-mini",
				"api_base":   litellmBase + "/v1",
				"api_keys":   []string{"file://litellm.key"},
				"enabled":    true,
			},
		},
		"channel_list": map[string]any{
			"pico": map[string]any{
				"enabled": true,
				"type":    "pico",
			},
		},
		"gateway": map[string]any{
			"host":       "localhost",
			"port":       18790,
			"hot_reload": false,
			"log_level":  "error",
		},
	}
}

func mergeLiteLLMDefaults(cfg map[string]any, litellmBase string) {
	agents := ensureMap(cfg, "agents")
	defaults := ensureMap(agents, "defaults")
	defaults["provider"] = "litellm"
	defaults["model_name"] = "default"
	if _, ok := defaults["workspace"]; !ok {
		defaults["workspace"] = "/root/.picoclaw/workspace"
	}
	if _, ok := defaults["restrict_to_workspace"]; !ok {
		defaults["restrict_to_workspace"] = true
	}

	model := map[string]any{
		"model_name": "default",
		"provider":   "litellm",
		"model":      "gpt-4o-mini",
		"api_base":   litellmBase + "/v1",
		"api_keys":   []string{"file://litellm.key"},
		"enabled":    true,
	}
	list, _ := cfg["model_list"].([]any)
	replaced := false
	for i, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if m["model_name"] == "default" {
			list[i] = model
			replaced = true
			break
		}
	}
	if !replaced {
		list = append(list, model)
	}
	cfg["model_list"] = list

	channels := ensureMap(cfg, "channel_list")
	if _, ok := channels["pico"]; !ok {
		channels["pico"] = map[string]any{"enabled": true, "type": "pico"}
	}
	gateway := ensureMap(cfg, "gateway")
	if _, ok := gateway["host"]; !ok {
		gateway["host"] = "localhost"
	}
	if _, ok := gateway["port"]; !ok {
		gateway["port"] = 18790
	}
}

func ensureMap(parent map[string]any, key string) map[string]any {
	if m, ok := parent[key].(map[string]any); ok {
		return m
	}
	m := map[string]any{}
	parent[key] = m
	return m
}

// SeedDashboardPassword creates (or rewrites) the launcher-auth.db inside
// volumeDir and stores a bcrypt(password) hash. The bcrypt cost is fixed at
// auth.BcryptCost to match picoclaw exactly.
func SeedDashboardPassword(ctx context.Context, volumeDir, password string) error {
	if password == "" {
		return fmt.Errorf("empty password")
	}
	if err := os.MkdirAll(volumeDir, 0o755); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("bcrypt: %w", err)
	}
	dbPath := filepath.Join(volumeDir, DBFilename)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, sqlCreateTable); err != nil {
		return fmt.Errorf("create table: %w", err)
	}
	if _, err := db.ExecContext(ctx, sqlUpsertHash, hash); err != nil {
		return fmt.Errorf("upsert hash: %w", err)
	}
	return nil
}
