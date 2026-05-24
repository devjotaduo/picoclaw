package tenant

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/mcp"
)

// ActiveMCPServer pairs a catalog entry with the per-tenant credential values
// captured by the admin UI. Credentials live separately from the catalog so
// the same hardcoded MCP definition can be activated by many tenants without
// any secret data leaking into the catalog (which is compiled into the binary
// and shared across deployments).
type ActiveMCPServer struct {
	Entry       mcp.Entry
	Credentials map[string]string
}

// WriteWorkspaceMCP materialises the given active MCP servers into a tenant
// home directory: per-server `auth/mcp-<id>.env` dotenv files (0o600) plus a
// merged `mcp.servers` block in `config.json`. The function is intentionally
// additive — it merges with pre-existing server entries rather than replacing
// them — so manually-added MCP servers in `config.json` survive a re-apply
// from the admin UI. Config writes are atomic (temp file + rename) so an
// interrupted write cannot leave the tenant with a corrupt config.json on
// next launcher boot.
func WriteWorkspaceMCP(homeDir string, servers []ActiveMCPServer) error {
	if len(servers) == 0 {
		return nil
	}

	cfgPath := filepath.Join(homeDir, "config.json")
	cfgRaw, err := os.ReadFile(cfgPath)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(cfgRaw, &cfg); err != nil {
		return fmt.Errorf("parse config.json: %w", err)
	}

	var mcpBlock map[string]any
	if raw, ok := cfg["mcp"]; ok && raw != nil {
		mcpBlock, ok = raw.(map[string]any)
		if !ok {
			return fmt.Errorf("config.json: \"mcp\" is %T, want object", raw)
		}
	}
	if mcpBlock == nil {
		mcpBlock = map[string]any{}
		cfg["mcp"] = mcpBlock
	}
	var mcpServers map[string]any
	if raw, ok := mcpBlock["servers"]; ok && raw != nil {
		mcpServers, ok = raw.(map[string]any)
		if !ok {
			return fmt.Errorf("config.json: \"mcp.servers\" is %T, want object", raw)
		}
	}
	if mcpServers == nil {
		mcpServers = map[string]any{}
		mcpBlock["servers"] = mcpServers
	}

	authDir := filepath.Join(homeDir, "auth")
	if err := os.MkdirAll(authDir, 0o700); err != nil {
		return fmt.Errorf("mkdir auth/: %w", err)
	}

	sorted := make([]ActiveMCPServer, len(servers))
	copy(sorted, servers)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Entry.ID < sorted[j].Entry.ID
	})

	for _, s := range sorted {
		envFile := fmt.Sprintf("auth/mcp-%s.env", s.Entry.ID)
		envPath := filepath.Join(homeDir, envFile)

		var b strings.Builder
		keys := s.Entry.Server.EnvKeys
		if len(keys) == 0 {
			for k := range s.Credentials {
				keys = append(keys, k)
			}
			sort.Strings(keys)
		}
		for _, k := range keys {
			v, ok := s.Credentials[k]
			if !ok {
				continue
			}
			if strings.ContainsAny(v, "\n\r") {
				return fmt.Errorf("mcp credential %q for %s contains newline", k, s.Entry.ID)
			}
			b.WriteString(k)
			b.WriteString("=")
			b.WriteString(v)
			b.WriteString("\n")
		}
		if err := os.WriteFile(envPath, []byte(b.String()), 0o600); err != nil {
			return fmt.Errorf("write %s: %w", envFile, err)
		}

		entry := map[string]any{
			"enabled":  true,
			"command":  s.Entry.Server.Command,
			"env_file": envFile,
		}
		if len(s.Entry.Server.Args) > 0 {
			entry["args"] = s.Entry.Server.Args
		}
		if s.Entry.Server.Type != "" {
			entry["type"] = s.Entry.Server.Type
		}
		if s.Entry.Server.URL != "" {
			entry["url"] = s.Entry.Server.URL
		}
		if len(s.Entry.Server.Headers) > 0 {
			headers := make(map[string]string, len(s.Entry.Server.Headers))
			for k, v := range s.Entry.Server.Headers {
				headers[k] = v
			}
			entry["headers"] = headers
		}
		mcpServers[s.Entry.ID] = entry
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	if err := writeFileAtomic(cfgPath, out, 0o600); err != nil {
		return fmt.Errorf("write config.json: %w", err)
	}
	return nil
}

// writeFileAtomic writes data to path via a sibling temp file + rename so a
// crash mid-write cannot leave a half-written file on disk. The temp file
// gets the requested perm before the rename so the published file is never
// world-readable even briefly.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".mcp-cfg-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, path)
}
