package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleListWorkspaceAgentsReadsMarkdownFiles(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	if err := os.WriteFile(filepath.Join(workspace, "AGENT.md"), []byte(`
# AGENT

## Agentes disponiveis
- Rafael: assistente interno.
- Clara: atendimento.
`), 0o644); err != nil {
		t.Fatalf("WriteFile(AGENT.md) error = %v", err)
	}
	writeWorkspaceAgentFile(t, workspace, "clara-atendente.md", `---
name: Clara
role: Atendente principal
visibility: atendimento
---

# Clara - Atendente Principal

Voce e Clara, atendente principal da empresa.
`)
	writeWorkspaceAgentFile(t, workspace, "rafael-assistente.md", `---
name: Rafael
role: Assistente interno
visibility: interno
---

# Rafael - Assistente Interno

Voce e Rafael, o Assistente interno.
`)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/workspace/agents", nil)
	h.handleListWorkspaceAgents(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/workspace/agents = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var got workspaceAgentsResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("Decode response error = %v", err)
	}
	if got.Workspace != workspace {
		t.Fatalf("workspace = %q, want %q", got.Workspace, workspace)
	}
	if len(got.Agents) != 2 {
		t.Fatalf("agents len = %d, want 2", len(got.Agents))
	}
	if got.Agents[0].Name != "Rafael" || got.Agents[1].Name != "Clara" {
		t.Fatalf("agent order = %#v, want Rafael then Clara", got.Agents)
	}
	if got.Agents[1].Role != "Atendente principal" {
		t.Fatalf("role = %q, want Atendente principal", got.Agents[1].Role)
	}
	if got.Agents[1].Visibility != "atendimento" {
		t.Fatalf("visibility = %q, want atendimento", got.Agents[1].Visibility)
	}
	if got.Agents[1].Path != "agents/clara-atendente.md" {
		t.Fatalf("path = %q, want agents/clara-atendente.md", got.Agents[1].Path)
	}
	if got.Agents[1].Content == "" {
		t.Fatal("content should include the original workspace agent markdown")
	}
}

func TestListWorkspaceAgentsMissingDirectoryReturnsEmpty(t *testing.T) {
	agents, err := listWorkspaceAgents(t.TempDir())
	if err != nil {
		t.Fatalf("listWorkspaceAgents() error = %v", err)
	}
	if len(agents) != 0 {
		t.Fatalf("agents len = %d, want 0", len(agents))
	}
}

func TestListWorkspaceAgentsReadsDirectoryAgents(t *testing.T) {
	_, workspace := setupTemplateHandler(t)
	writeDashboardFile(t, filepath.Join(workspace, "agents", "sofia", "AGENT.md"), `---
name: Sofia
role: Onboarding
visibility: internal
---

# Sofia

Conduz o discovery inicial.
`)

	agents, err := listWorkspaceAgents(workspace)
	if err != nil {
		t.Fatalf("listWorkspaceAgents() error = %v", err)
	}
	if len(agents) != 1 {
		t.Fatalf("agents len = %d, want 1: %#v", len(agents), agents)
	}
	if agents[0].ID != "sofia" || agents[0].Path != "agents/sofia/AGENT.md" {
		t.Fatalf("directory agent = %#v, want ID sofia and nested path", agents[0])
	}
	if agents[0].Content == "" {
		t.Fatal("content should include nested AGENT.md")
	}
}

func TestHandleGetWorkspaceAgentRawReadsMarkdown(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	content := `---
name: Clara
role: Atendente principal
visibility: atendimento
---

# Clara - Atendente Principal

Voce e Clara, atendente principal da empresa.
`
	writeWorkspaceAgentFile(t, workspace, "clara-atendente.md", content)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/workspace/agents/clara-atendente/raw", nil)
	req.SetPathValue("agentID", "clara-atendente")
	h.handleGetWorkspaceAgentRaw(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET raw agent = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var got workspaceAgentDetailResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("Decode response error = %v", err)
	}
	if got.Name != "Clara" {
		t.Fatalf("name = %q, want Clara", got.Name)
	}
	if got.Content != content {
		t.Fatalf("content = %q, want original markdown", got.Content)
	}
}

func writeWorkspaceAgentFile(t *testing.T, workspace, name, content string) {
	t.Helper()
	dir := filepath.Join(workspace, "agents")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", name, err)
	}
}
