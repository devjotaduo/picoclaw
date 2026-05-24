package tenant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/mcp"
)

func TestWriteWorkspaceMCPFiles(t *testing.T) {
	dst := t.TempDir()
	cfgPath := filepath.Join(dst, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{"mcp":{"servers":{}}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	servers := []ActiveMCPServer{
		{
			Entry: mustLookup(t, "notion"),
			Credentials: map[string]string{
				"NOTION_API_KEY": "secret_abc",
			},
		},
	}
	if err := WriteWorkspaceMCP(dst, servers); err != nil {
		t.Fatal(err)
	}

	envPath := filepath.Join(dst, "auth", "mcp-notion.env")
	st, err := os.Stat(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && st.Mode().Perm() != 0o600 {
		t.Errorf("env file mode: got %o, want 0600", st.Mode().Perm())
	}
	content, _ := os.ReadFile(envPath)
	want := "NOTION_API_KEY=secret_abc\n"
	if string(content) != want {
		t.Errorf("env content: got %q, want %q", content, want)
	}

	raw, _ := os.ReadFile(cfgPath)
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	mcpServers, _ := cfg["mcp"].(map[string]any)["servers"].(map[string]any)
	notion, ok := mcpServers["notion"].(map[string]any)
	if !ok {
		t.Fatalf("notion not in mcp.servers: %+v", mcpServers)
	}
	if notion["enabled"] != true {
		t.Error("notion.enabled should be true")
	}
	if notion["env_file"] != "auth/mcp-notion.env" {
		t.Errorf("env_file: got %v, want auth/mcp-notion.env", notion["env_file"])
	}
	if notion["command"] != "npx" {
		t.Errorf("command: got %v, want npx", notion["command"])
	}
}

func TestWriteWorkspaceMCPNoOpWhenEmpty(t *testing.T) {
	dst := t.TempDir()
	_ = os.WriteFile(filepath.Join(dst, "config.json"), []byte(`{"mcp":{"servers":{"existing":{"enabled":true,"command":"x"}}}}`), 0o644)
	if err := WriteWorkspaceMCP(dst, nil); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(filepath.Join(dst, "config.json"))
	if string(raw) != `{"mcp":{"servers":{"existing":{"enabled":true,"command":"x"}}}}` {
		t.Errorf("config.json was modified: %s", raw)
	}
}

func TestWriteWorkspaceMCPMergesWithExisting(t *testing.T) {
	dst := t.TempDir()
	_ = os.WriteFile(filepath.Join(dst, "config.json"),
		[]byte(`{"mcp":{"servers":{"keep-me":{"enabled":true,"command":"x"}}}}`), 0o644)

	servers := []ActiveMCPServer{
		{Entry: mustLookup(t, "notion"), Credentials: map[string]string{"NOTION_API_KEY": "k"}},
	}
	if err := WriteWorkspaceMCP(dst, servers); err != nil {
		t.Fatal(err)
	}

	raw, _ := os.ReadFile(filepath.Join(dst, "config.json"))
	var cfg map[string]any
	_ = json.Unmarshal(raw, &cfg)
	mcpServers := cfg["mcp"].(map[string]any)["servers"].(map[string]any)
	if _, ok := mcpServers["keep-me"]; !ok {
		t.Error("WriteWorkspaceMCP clobbered pre-existing entry")
	}
	if _, ok := mcpServers["notion"]; !ok {
		t.Error("WriteWorkspaceMCP didn't add notion")
	}
}

func TestWriteWorkspaceMCPPubloraKeepsSecretInEnvFile(t *testing.T) {
	dst := t.TempDir()
	cfgPath := filepath.Join(dst, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{"mcp":{"servers":{}}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	servers := []ActiveMCPServer{
		{
			Entry: mustLookup(t, "publora-instagram"),
			Credentials: map[string]string{
				"PUBLORA_API_KEY": "sk_test_secret",
			},
		},
	}
	if err := WriteWorkspaceMCP(dst, servers); err != nil {
		t.Fatal(err)
	}

	envPath := filepath.Join(dst, "auth", "mcp-publora-instagram.env")
	content, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "PUBLORA_API_KEY=sk_test_secret\n" {
		t.Fatalf("env content = %q, want only PUBLORA_API_KEY", content)
	}

	raw, _ := os.ReadFile(cfgPath)
	if string(raw) == "" || string(raw) == "sk_test_secret" {
		t.Fatalf("config.json should not contain raw secret: %s", raw)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	mcpServers := cfg["mcp"].(map[string]any)["servers"].(map[string]any)
	publora, ok := mcpServers["publora-instagram"].(map[string]any)
	if !ok {
		t.Fatalf("publora-instagram not in mcp.servers: %+v", mcpServers)
	}
	if publora["type"] != "http" {
		t.Fatalf("type = %v, want http", publora["type"])
	}
	if publora["url"] != "https://mcp.publora.com" {
		t.Fatalf("url = %v, want https://mcp.publora.com", publora["url"])
	}
	headers, ok := publora["headers"].(map[string]any)
	if !ok {
		t.Fatalf("headers = %#v, want object", publora["headers"])
	}
	if headers["Authorization"] != "Bearer ${PUBLORA_API_KEY}" {
		t.Fatalf("Authorization header = %v, want env placeholder", headers["Authorization"])
	}
	if publora["env_file"] != "auth/mcp-publora-instagram.env" {
		t.Fatalf("env_file = %v, want auth/mcp-publora-instagram.env", publora["env_file"])
	}
}

func mustLookup(t *testing.T, id string) mcp.Entry {
	t.Helper()
	e, ok := mcp.Lookup(id)
	if !ok {
		t.Fatalf("mcp.Lookup(%q) returned not-found", id)
	}
	return e
}
