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
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"gopkg.in/yaml.v3"
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
// No-op when llmKey is empty (LiteLLM integration disabled). When a launcher
// profile already includes config.json, this injects the tenant-scoped LiteLLM
// credential into LiteLLM model entries. A profile-selected default model is
// kept only when it resolves to a tenant-safe usable model; sanitized profiles
// with a provider default but no credential fall back to the per-tenant LiteLLM
// model so the gateway can start in production.
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

	mergeLiteLLMCredential(cfg, litellmBase)

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

func mergeLiteLLMCredential(cfg map[string]any, litellmBase string) {
	agents := ensureMap(cfg, "agents")
	defaults := ensureMap(agents, "defaults")
	if _, ok := defaults["provider"]; !ok {
		defaults["provider"] = "litellm"
	}
	if _, ok := defaults["model_name"]; !ok {
		defaults["model_name"] = "default"
	}
	if _, ok := defaults["workspace"]; !ok {
		defaults["workspace"] = "/root/.picoclaw/workspace"
	}
	if _, ok := defaults["restrict_to_workspace"]; !ok {
		defaults["restrict_to_workspace"] = true
	}

	fallbackModel := map[string]any{
		"model_name": "default",
		"provider":   "litellm",
		"model":      "gpt-4o-mini",
		"api_base":   litellmBase + "/v1",
		"api_keys":   []string{"file://litellm.key"},
		"enabled":    true,
	}
	list, _ := cfg["model_list"].([]any)
	hasLiteLLMModel := false
	fallbackModelName := "default"
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if isLiteLLMModel(m) {
			m["api_base"] = litellmBase + "/v1"
			m["api_keys"] = []string{"file://litellm.key"}
			if _, ok := m["enabled"]; !ok {
				m["enabled"] = true
			}
			hasLiteLLMModel = true
			if name := modelName(m); name != "" {
				fallbackModelName = name
			}
		}
	}
	if !hasLiteLLMModel {
		list = append(list, fallbackModel)
	}
	cfg["model_list"] = list
	ensureUsableDefaultModel(defaults, list, fallbackModelName)

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

func isLiteLLMModel(m map[string]any) bool {
	provider, _ := m["provider"].(string)
	if strings.EqualFold(strings.TrimSpace(provider), "litellm") {
		return true
	}
	model, _ := m["model"].(string)
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(model)), "litellm/")
}

func ensureUsableDefaultModel(defaults map[string]any, list []any, fallbackModelName string) {
	defaultName, _ := defaults["model_name"].(string)
	defaultName = strings.TrimSpace(defaultName)
	defaultModel := findModelByName(list, defaultName)
	if defaultModel != nil && tenantSafeModelUsable(defaultModel) {
		return
	}
	if strings.TrimSpace(fallbackModelName) == "" {
		fallbackModelName = "default"
	}
	defaults["provider"] = "litellm"
	defaults["model_name"] = fallbackModelName
}

func findModelByName(list []any, name string) map[string]any {
	if name == "" {
		return nil
	}
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if modelName(m) == name {
			return m
		}
	}
	return nil
}

func modelName(m map[string]any) string {
	if s, _ := m["model_name"].(string); strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	if s, _ := m["name"].(string); strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	return ""
}

func tenantSafeModelUsable(m map[string]any) bool {
	if enabled, ok := m["enabled"].(bool); ok && !enabled {
		return false
	}
	if isLiteLLMModel(m) {
		return true
	}
	if s, _ := m["api_key"].(string); strings.TrimSpace(s) != "" {
		return true
	}
	switch keys := m["api_keys"].(type) {
	case []any:
		return len(keys) > 0
	case []string:
		return len(keys) > 0
	}
	return false
}

func ensureMap(parent map[string]any, key string) map[string]any {
	if m, ok := parent[key].(map[string]any); ok {
		return m
	}
	m := map[string]any{}
	parent[key] = m
	return m
}

func sanitizeSecurityYAMLFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	clean, err := sanitizeSecurityYAML(b)
	if err != nil {
		return err
	}
	return os.WriteFile(path, clean, 0o600)
}

func sanitizeSecurityYAML(b []byte) ([]byte, error) {
	if len(strings.TrimSpace(string(b))) == 0 {
		return b, nil
	}
	var v any
	if err := yaml.Unmarshal(b, &v); err != nil {
		return nil, err
	}
	stripSecretsRecursive(v)
	out, err := yaml.Marshal(v)
	if err != nil {
		return nil, err
	}
	return out, nil
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
