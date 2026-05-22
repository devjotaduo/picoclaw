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

type ActiveMCPServer struct {
	Entry       mcp.Entry
	Credentials map[string]string
}

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

	mcpBlock, _ := cfg["mcp"].(map[string]any)
	if mcpBlock == nil {
		mcpBlock = map[string]any{}
		cfg["mcp"] = mcpBlock
	}
	mcpServers, _ := mcpBlock["servers"].(map[string]any)
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
		mcpServers[s.Entry.ID] = entry
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	if err := os.WriteFile(cfgPath, out, 0o644); err != nil {
		return fmt.Errorf("write config.json: %w", err)
	}
	return nil
}
