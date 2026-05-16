package tenant

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/policy"
	"gopkg.in/yaml.v3"
)

type SeedFiles struct {
	ConfigJSON   json.RawMessage `json:"config_json,omitempty"`
	AgentMD      string          `json:"agent_md,omitempty"`
	SoulMD       string          `json:"soul_md,omitempty"`
	BehaviorJSON json.RawMessage `json:"behavior_json,omitempty"`
}

func ImportStandaloneProfile(templateDir, seedPath string) error {
	if templateDir == "" {
		return fmt.Errorf("TENANT_TEMPLATE_DIR is not configured")
	}
	if err := os.RemoveAll(seedPath); err != nil {
		return err
	}
	if err := os.MkdirAll(seedPath, 0o755); err != nil {
		return err
	}
	if err := CopyTemplate(templateDir, seedPath); err != nil {
		return err
	}
	return SanitizeSeed(seedPath)
}

func ReadSeedFiles(seedPath string) (SeedFiles, error) {
	var files SeedFiles
	if b, err := os.ReadFile(filepath.Join(seedPath, "config.json")); err == nil {
		files.ConfigJSON = json.RawMessage(b)
	} else if !errors.Is(err, os.ErrNotExist) {
		return files, err
	}
	if b, err := os.ReadFile(filepath.Join(seedPath, "workspace", "AGENT.md")); err == nil {
		files.AgentMD = string(b)
	} else if !errors.Is(err, os.ErrNotExist) {
		return files, err
	}
	if b, err := os.ReadFile(filepath.Join(seedPath, "workspace", "SOUL.md")); err == nil {
		files.SoulMD = string(b)
	} else if !errors.Is(err, os.ErrNotExist) {
		return files, err
	}
	if b, err := os.ReadFile(filepath.Join(seedPath, "workspace", "behavior.json")); err == nil {
		files.BehaviorJSON = json.RawMessage(b)
	} else if !errors.Is(err, os.ErrNotExist) {
		return files, err
	}
	return files, nil
}

func WriteSeedFiles(seedPath string, files SeedFiles) error {
	if err := os.MkdirAll(filepath.Join(seedPath, "workspace"), 0o755); err != nil {
		return err
	}
	if len(files.ConfigJSON) > 0 {
		if !json.Valid(files.ConfigJSON) {
			return fmt.Errorf("config_json is not valid JSON")
		}
		if err := writeJSONFile(filepath.Join(seedPath, "config.json"), files.ConfigJSON, 0o600); err != nil {
			return err
		}
	}
	if files.AgentMD != "" {
		if err := os.WriteFile(filepath.Join(seedPath, "workspace", "AGENT.md"), []byte(files.AgentMD), 0o644); err != nil {
			return err
		}
	}
	if files.SoulMD != "" {
		if err := os.WriteFile(filepath.Join(seedPath, "workspace", "SOUL.md"), []byte(files.SoulMD), 0o644); err != nil {
			return err
		}
	}
	if len(files.BehaviorJSON) > 0 {
		if !json.Valid(files.BehaviorJSON) {
			return fmt.Errorf("behavior_json is not valid JSON")
		}
		if err := writeJSONFile(filepath.Join(seedPath, "workspace", "behavior.json"), files.BehaviorJSON, 0o644); err != nil {
			return err
		}
	}
	return SanitizeSeed(seedPath)
}

func WriteLauncherPolicy(volumeDir string, rolePolicy policy.RolePolicy) error {
	return policy.WriteFile(volumeDir, rolePolicy)
}

func ApplyProfileSeed(seedPath, tenantVolume string) (string, error) {
	if seedPath == "" {
		return "", fmt.Errorf("profile seed path is empty")
	}
	info, err := os.Stat(seedPath)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("profile seed %s is not a directory", seedPath)
	}
	backupDir := filepath.Join(tenantVolume, "backups", "profile-"+time.Now().UTC().Format("20060102T150405Z"))
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return "", err
	}
	err = filepath.Walk(seedPath, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(seedPath, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if shouldSkipTemplatePath(rel) {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		dst := filepath.Join(tenantVolume, rel)
		if fi.IsDir() {
			return os.MkdirAll(dst, fi.Mode().Perm())
		}
		if fi.Mode()&os.ModeSymlink != 0 || !fi.Mode().IsRegular() {
			return nil
		}
		switch filepath.ToSlash(rel) {
		case "config.json":
			return applyProfileConfig(path, dst, backupDir)
		case ".security.yml", ".security.yaml":
			return applyProfileSecurityYAML(path, dst, backupDir)
		}
		if err := backupExisting(dst, filepath.Join(backupDir, rel)); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		return copyFile(path, dst, fi.Mode().Perm())
	})
	if err != nil {
		return backupDir, err
	}
	return backupDir, nil
}

func SanitizeSeed(seedPath string) error {
	return filepath.Walk(seedPath, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(seedPath, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if shouldSkipTemplatePath(rel) {
			if fi.IsDir() {
				if err := os.RemoveAll(path); err != nil {
					return err
				}
				return filepath.SkipDir
			}
			return os.Remove(path)
		}
		if fi.IsDir() {
			return nil
		}
		switch filepath.ToSlash(rel) {
		case "config.json":
			b, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			clean, err := sanitizeConfigJSON(b)
			if err != nil {
				return err
			}
			return os.WriteFile(path, clean, 0o600)
		case ".security.yml", ".security.yaml":
			return sanitizeSecurityYAMLFile(path)
		}
		return nil
	})
}

func applyProfileConfig(seedPath, dstPath, backupDir string) error {
	seedBytes, err := os.ReadFile(seedPath)
	if err != nil {
		return err
	}
	seedBytes, err = sanitizeConfigJSON(seedBytes)
	if err != nil {
		return err
	}
	var seed map[string]any
	if err := json.Unmarshal(seedBytes, &seed); err != nil {
		return err
	}
	if oldBytes, err := os.ReadFile(dstPath); err == nil {
		var old map[string]any
		if err := json.Unmarshal(oldBytes, &old); err == nil {
			preserveConfigSecrets(seed, old)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := backupExisting(dstPath, filepath.Join(backupDir, "config.json")); err != nil {
		return err
	}
	out, err := json.MarshalIndent(seed, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dstPath, append(out, '\n'), 0o600)
}

func applyProfileSecurityYAML(seedPath, dstPath, backupDir string) error {
	seedBytes, err := os.ReadFile(seedPath)
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(seedBytes))) == 0 {
		return nil
	}
	var next any
	if err := yaml.Unmarshal(seedBytes, &next); err != nil {
		return err
	}
	stripSecretsRecursive(next)
	if oldBytes, err := os.ReadFile(dstPath); err == nil && len(strings.TrimSpace(string(oldBytes))) > 0 {
		var old any
		if err := yaml.Unmarshal(oldBytes, &old); err == nil {
			preserveSecretsRecursive(next, old)
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := backupExisting(dstPath, filepath.Join(backupDir, filepath.Base(dstPath))); err != nil {
		return err
	}
	out, err := yaml.Marshal(next)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dstPath, out, 0o600)
}

func sanitizeConfigJSON(b []byte) ([]byte, error) {
	if len(strings.TrimSpace(string(b))) == 0 {
		return b, nil
	}
	var cfg map[string]any
	if err := json.Unmarshal(b, &cfg); err != nil {
		return nil, err
	}
	if list, ok := cfg["model_list"].([]any); ok {
		for _, item := range list {
			if m, ok := item.(map[string]any); ok {
				delete(m, "api_key")
				delete(m, "api_keys")
			}
		}
	}
	if channels, ok := cfg["channel_list"].(map[string]any); ok {
		for _, raw := range channels {
			if m, ok := raw.(map[string]any); ok {
				stripChannelSecrets(m)
			}
		}
	}
	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}

func preserveConfigSecrets(next, old map[string]any) {
	oldModels := indexModelSecrets(old["model_list"])
	if list, ok := next["model_list"].([]any); ok {
		for _, item := range list {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			name, _ := m["model_name"].(string)
			if secrets, ok := oldModels[name]; ok {
				for k, v := range secrets {
					if _, exists := m[k]; !exists {
						m[k] = v
					}
				}
			}
		}
	}
	oldChannels, _ := old["channel_list"].(map[string]any)
	nextChannels, _ := next["channel_list"].(map[string]any)
	for channelName, raw := range nextChannels {
		nextMap, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		oldMap, _ := oldChannels[channelName].(map[string]any)
		for _, key := range secretKeys {
			if oldVal, ok := oldMap[key]; ok {
				nextMap[key] = oldVal
			}
		}
	}
}

func indexModelSecrets(raw any) map[string]map[string]any {
	out := map[string]map[string]any{}
	list, _ := raw.([]any)
	for _, item := range list {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, _ := m["model_name"].(string)
		if name == "" {
			continue
		}
		secrets := map[string]any{}
		for _, key := range []string{"api_key", "api_keys"} {
			if val, ok := m[key]; ok {
				secrets[key] = val
			}
		}
		if len(secrets) > 0 {
			out[name] = secrets
		}
	}
	return out
}

var secretKeys = []string{
	"api_key", "api_keys", "token", "bot_token", "app_token", "app_secret",
	"encrypt_key", "verification_token", "client_secret", "channel_secret",
	"channel_access_token", "access_token", "secret", "username", "password",
	"nickserv_password", "sasl_password",
}

func isSecretKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	for _, secretKey := range secretKeys {
		if key == secretKey {
			return true
		}
	}
	return false
}

func stripChannelSecrets(m map[string]any) {
	for _, key := range secretKeys {
		delete(m, key)
	}
}

func stripSecretsRecursive(v any) {
	switch node := v.(type) {
	case map[string]any:
		for key, child := range node {
			if isSecretKey(key) {
				delete(node, key)
				continue
			}
			stripSecretsRecursive(child)
		}
	case map[any]any:
		for key, child := range node {
			if s, ok := key.(string); ok && isSecretKey(s) {
				delete(node, key)
				continue
			}
			stripSecretsRecursive(child)
		}
	case []any:
		for _, child := range node {
			stripSecretsRecursive(child)
		}
	}
}

func preserveSecretsRecursive(next, old any) {
	nextMap, nextOK := next.(map[string]any)
	oldMap, oldOK := old.(map[string]any)
	if !nextOK || !oldOK {
		return
	}
	for key, oldVal := range oldMap {
		if isSecretKey(key) {
			if _, exists := nextMap[key]; !exists {
				nextMap[key] = oldVal
			}
			continue
		}
		if nextVal, exists := nextMap[key]; exists {
			preserveSecretsRecursive(nextVal, oldVal)
		}
	}
}

func backupExisting(src, dst string) error {
	fi, err := os.Stat(src)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if fi.IsDir() || !fi.Mode().IsRegular() {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	return copyFile(src, dst, fi.Mode().Perm())
}

func writeJSONFile(path string, raw json.RawMessage, mode os.FileMode) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(out, '\n'), mode)
}
