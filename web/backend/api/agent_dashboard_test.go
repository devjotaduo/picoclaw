package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHandleGetAgentDashboardToleratesMissingOptionalSources(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	writeWorkspaceAgentFile(t, workspace, "rafael.md", `---
name: Rafael
role: Assistente interno
---

# Rafael - Assistente Interno
`)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/agent-dashboard", nil)
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/agent-dashboard = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), workspace) {
		t.Fatalf("dashboard response leaked absolute workspace path %q: %s", workspace, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `"errors":null`) ||
		strings.Contains(rec.Body.String(), `"missing_sources":null`) {
		t.Fatalf("dashboard health arrays must be encoded as [] instead of null: %s", rec.Body.String())
	}
	var got agentDashboardResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("Decode response error = %v", err)
	}
	if got.Workspace != "workspace" {
		t.Fatalf("workspace = %q, want workspace", got.Workspace)
	}
	if got.Metrics.Agents == 0 {
		t.Fatal("expected at least one agent in metrics")
	}
	if len(got.Health.MissingSources) == 0 {
		t.Fatal("expected missing optional sources to be reported")
	}
}

func TestAgentDashboardParsesMelhorias(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	writeDashboardFile(t, filepath.Join(workspace, "memory", "melhorias.md"), `# Melhorias

---

id: MEL-1
data: 2026-05-20
status: pendente
Prioridade: alta
Agente recomendado: Rafael

O que foi percebido:
Atendimentos parados estao acumulando.

Por que importa:
Pode atrasar resposta ao cliente.

Sugestao:
Rafael deve alertar o dono antes do fim do expediente.
`)

	got := requestAgentDashboard(t, h)
	var found *agentDashboardItem
	for i := range got.Items {
		if got.Items[i].ID == "MEL-1" {
			found = &got.Items[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("MEL-1 not found in items: %#v", got.Items)
	}
	if found.Type != "suggestion" {
		t.Fatalf("type = %q, want suggestion", found.Type)
	}
	if found.Status != "pending" {
		t.Fatalf("status = %q, want pending", found.Status)
	}
	if found.Priority != "high" {
		t.Fatalf("priority = %q, want high", found.Priority)
	}
	if found.AgentName != "Rafael" {
		t.Fatalf("agent_name = %q, want Rafael", found.AgentName)
	}
	if !strings.Contains(found.Summary, "alertar o dono") {
		t.Fatalf("summary = %q, want suggestion text", found.Summary)
	}
}

func TestAgentDashboardCronIgnoresInvalidJobsAndKeepsValid(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	writeDashboardFile(t, filepath.Join(workspace, "cron", "jobs.json"), `{
  "jobs": [
    {"id": "", "name": "", "enabled": true},
    {
      "id": "analytics-daily-report",
      "name": "Analytics daily report",
      "enabled": true,
      "schedule": {"kind": "cron", "expr": "59 23 * * *", "tz": "America/Sao_Paulo"},
      "payload": {"kind": "command", "command": "analytics.report.daily", "agent_id": "rafael"},
      "state": {"nextRunAtMs": 1779332340000},
      "updatedAtMs": 1779310440444
    }
  ]
}`)

	got := requestAgentDashboard(t, h)
	if len(got.Tasks) != 1 {
		t.Fatalf("tasks len = %d, want 1: %#v", len(got.Tasks), got.Tasks)
	}
	if got.Tasks[0].ID != "analytics-daily-report" {
		t.Fatalf("task id = %q, want analytics-daily-report", got.Tasks[0].ID)
	}
	if got.Tasks[0].Status != "scheduled" {
		t.Fatalf("task status = %q, want scheduled", got.Tasks[0].Status)
	}
	if got.Metrics.ActiveTasks != 1 {
		t.Fatalf("active_tasks = %d, want 1", got.Metrics.ActiveTasks)
	}
	if len(got.Health.Errors) == 0 {
		t.Fatal("expected ignored invalid job to be reported")
	}
}

func TestAgentDashboardIncludesGeneratedArtifactsAndServesThem(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	writeDashboardFile(
		t,
		filepath.Join(workspace, "output", "sites", "campanha", "index.html"),
		`<html><body>Campanha</body></html>`,
	)
	writeDashboardFile(t, filepath.Join(workspace, "output", "marketing", "post.png"), "fake-png")

	got := requestAgentDashboard(t, h)
	if len(got.Artifacts) < 2 {
		t.Fatalf("artifacts len = %d, want at least 2: %#v", len(got.Artifacts), got.Artifacts)
	}
	var imageURL string
	for _, artifact := range got.Artifacts {
		if strings.Contains(artifact.Source, workspace) {
			t.Fatalf("artifact leaked absolute workspace path: %#v", artifact)
		}
		if artifact.Type == "image" {
			imageURL = artifact.URL
		}
	}
	if imageURL == "" {
		t.Fatalf("image artifact not found: %#v", got.Artifacts)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, imageURL, nil)
	req.SetPathValue("asset", strings.TrimPrefix(imageURL, "/api/agent-dashboard/artifacts/"))
	h.handleGetAgentDashboardArtifact(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET artifact = %d, want 200: %s", rec.Code, rec.Body.String())
	}
}

func TestAgentDashboardSavesUserResponse(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	body := strings.NewReader(`{"item_id":"MEL-1","agent_name":"Rafael","message":"Pode seguir com essa orientação."}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/agent-dashboard/responses", body)
	h.handleCreateAgentDashboardResponse(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("POST response = %d, want 201: %s", rec.Code, rec.Body.String())
	}
	var saved agentDashboardSavedResponse
	if err := json.NewDecoder(rec.Body).Decode(&saved); err != nil {
		t.Fatalf("decode saved response: %v", err)
	}
	if saved.Message != "Pode seguir com essa orientação." {
		t.Fatalf("message = %q", saved.Message)
	}
	files, err := filepath.Glob(filepath.Join(workspace, "dashboard", "responses", "*.json"))
	if err != nil {
		t.Fatalf("glob responses: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("saved files len = %d, want 1", len(files))
	}
}

func requestAgentDashboard(t *testing.T, h *Handler) agentDashboardResponse {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/agent-dashboard", nil)
	h.handleGetAgentDashboard(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/agent-dashboard = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var got agentDashboardResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("Decode response error = %v", err)
	}
	return got
}

func writeDashboardFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}
