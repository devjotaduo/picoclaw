package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/config"
	ppid "github.com/sipeed/picoclaw/pkg/pid"
)

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

func TestFirstNonEmpty(t *testing.T) {
	tests := []struct {
		name   string
		values []string
		want   string
	}{
		{"first wins", []string{"a", "b"}, "a"},
		{"skip empty", []string{"", "b"}, "b"},
		{"skip two empties", []string{"", "", "c"}, "c"},
		{"all empty", []string{"", ""}, ""},
		{"no args", []string{}, ""},
		{"whitespace-only skipped", []string{"   ", "ok"}, "ok"},
		{"first non-whitespace", []string{"hi", "there"}, "hi"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := firstNonEmpty(tt.values...); got != tt.want {
				t.Fatalf("firstNonEmpty(%v) = %q, want %q", tt.values, got, tt.want)
			}
		})
	}
}

func TestPublicMarketingAssetServesFile(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	workspace := t.TempDir()
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	cfg.Agents.List = []config.AgentConfig{
		{
			ID:        "marketing",
			Name:      "Maya",
			Workspace: workspace,
			RoleConfig: &config.AgentRoleConfig{
				Kind: "marketing",
				Marketing: &config.MarketingAgentRoleConfig{
					PublicPublishDir: "public/marketing",
				},
			},
		},
	}
	if err := config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Join(workspace, "public", "marketing"), 0o755); err != nil {
		t.Fatalf("mkdir public dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "public", "marketing", "catalogo.html"), []byte("<!doctype html><title>ok</title>"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/public/marketing/catalogo.html", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "<title>ok</title>") {
		t.Fatalf("body = %q, want served html", body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("content-type = %q, want text/html", ct)
	}
}

func TestPublicMarketingAssetRejectsTraversalDirectoryAndBlockedExt(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	workspace := t.TempDir()
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	cfg.Agents.List = []config.AgentConfig{{
		ID:        "marketing",
		Name:      "Maya",
		Workspace: workspace,
		RoleConfig: &config.AgentRoleConfig{
			Kind:      "marketing",
			Marketing: &config.MarketingAgentRoleConfig{PublicPublishDir: "public/marketing"},
		},
	}}
	if err := config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	publicDir := filepath.Join(workspace, "public", "marketing")
	if err := os.MkdirAll(filepath.Join(publicDir, "dir"), 0o755); err != nil {
		t.Fatalf("mkdir public dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "secret.html"), []byte("secret"), 0o644); err != nil {
		t.Fatalf("write secret: %v", err)
	}
	if err := os.WriteFile(filepath.Join(publicDir, "run.sh"), []byte("echo no"), 0o644); err != nil {
		t.Fatalf("write blocked ext: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	for _, path := range []string{
		"/public/marketing/%2e%2e/secret.html",
		"/public/marketing/dir",
		"/public/marketing/run.sh",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s status = %d, want %d", path, rec.Code, http.StatusNotFound)
		}
	}
}

func TestPublicMarketingProposalAddsPublicURLs(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	workspace := t.TempDir()
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	cfg.Agents.List = []config.AgentConfig{{
		ID:        "marketing",
		Name:      "Maya",
		Workspace: workspace,
		Access: &config.AgentAccessConfig{
			PanelEnabled: true,
			PanelRoles:   []string{"platform_admin"},
		},
		RoleConfig: &config.AgentRoleConfig{
			Kind:      "marketing",
			Marketing: &config.MarketingAgentRoleConfig{PublicPublishDir: "public/marketing"},
		},
	}}
	if err := config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	assetPath := filepath.Join(workspace, "public", "marketing", "site.html")
	if err := os.MkdirAll(filepath.Dir(assetPath), 0o755); err != nil {
		t.Fatalf("mkdir asset dir: %v", err)
	}
	if err := os.WriteFile(assetPath, []byte("<html></html>"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}
	proposalDir := filepath.Join(workspace, "proposals")
	if err := os.MkdirAll(proposalDir, 0o755); err != nil {
		t.Fatalf("mkdir proposals: %v", err)
	}
	proposal := map[string]any{
		"title":       "Site",
		"kind":        "site",
		"asset_paths": []string{assetPath},
	}
	data, _ := json.Marshal(proposal)
	if err := os.WriteFile(filepath.Join(proposalDir, "site.json"), data, 0o644); err != nil {
		t.Fatalf("write proposal: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents/marketing/proposals", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var got []map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	urls, _ := got[0]["public_urls"].([]any)
	if len(urls) != 1 || urls[0] != "/public/marketing/site.html" {
		t.Fatalf("public_urls = %#v, want /public/marketing/site.html", got[0]["public_urls"])
	}
}

func TestIsInternalAgentAdminRole(t *testing.T) {
	tests := []struct {
		role string
		want bool
	}{
		{"tenant_owner", true},
		{"tenant_admin", true},
		{"platform_admin", true},
		{"viewer", false},
		{"operator", false},
		{"", false},
		{"PLATFORM_ADMIN", false}, // case-sensitive
	}
	for _, tt := range tests {
		t.Run(tt.role, func(t *testing.T) {
			if got := isInternalAgentAdminRole(tt.role); got != tt.want {
				t.Fatalf("isInternalAgentAdminRole(%q) = %v, want %v", tt.role, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// findAgentConfig
// ---------------------------------------------------------------------------

func TestFindAgentConfig(t *testing.T) {
	cfg := &config.Config{}
	cfg.Agents.List = []config.AgentConfig{
		{ID: "main", Name: "Main Agent", Workspace: t.TempDir()},
		{ID: "vendas", Name: "Vendas", Workspace: t.TempDir()},
	}

	t.Run("found by id", func(t *testing.T) {
		got, ok := findAgentConfig(cfg, "main")
		if !ok {
			t.Fatal("expected to find 'main' agent")
		}
		if got.Name != "Main Agent" {
			t.Fatalf("name = %q, want %q", got.Name, "Main Agent")
		}
	})

	t.Run("found by normalized id", func(t *testing.T) {
		got, ok := findAgentConfig(cfg, "VENDAS")
		if !ok {
			t.Fatal("expected to find 'vendas' agent via normalized id")
		}
		if got.Name != "Vendas" {
			t.Fatalf("name = %q, want %q", got.Name, "Vendas")
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, ok := findAgentConfig(cfg, "nonexistent")
		if ok {
			t.Fatal("expected not to find 'nonexistent' agent")
		}
	})
}

// ---------------------------------------------------------------------------
// setupAgentsTestEnv: configPath with agents.list populated
// ---------------------------------------------------------------------------

func setupAgentsTestEnv(t *testing.T) (configPath string, agentWorkspace string, cleanup func()) {
	t.Helper()
	configPath, cleanup = setupOAuthTestEnv(t)

	agentWorkspace = t.TempDir()

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	cfg.Agents.List = []config.AgentConfig{
		{
			ID:        "main",
			Name:      "Main Agent",
			Default:   true,
			Workspace: cfg.Agents.Defaults.Workspace,
			Access: &config.AgentAccessConfig{
				PanelEnabled: true,
				PanelRoles:   []string{"tenant_owner", "tenant_admin", "platform_admin"},
			},
		},
		{
			ID:        "vendas",
			Name:      "Vendas",
			Workspace: agentWorkspace,
			Access: &config.AgentAccessConfig{
				PanelEnabled: true,
				PanelRoles:   []string{"tenant_owner", "tenant_admin", "platform_admin"},
			},
		},
	}
	if err := config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig() error = %v", err)
	}
	return configPath, agentWorkspace, cleanup
}

// ---------------------------------------------------------------------------
// GET /api/internal-agents
// ---------------------------------------------------------------------------

func TestHandleListInternalAgents_MinimalConfig(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp internalAgentsResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Agents == nil {
		// nil is acceptable for an empty list
		resp.Agents = []internalAgentSummary{}
	}
}

func TestHandleListInternalAgents_WithAgentsList(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp internalAgentsResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	// role defaults to platform_admin when no trusted gateway header
	if resp.Role != "platform_admin" {
		t.Fatalf("role = %q, want %q", resp.Role, "platform_admin")
	}
	if resp.MainAgentID == "" {
		t.Fatal("main_agent_id should not be empty")
	}
	if len(resp.Agents) == 0 {
		t.Fatal("agents list should not be empty when agents.list is configured")
	}
}

func TestHandleListInternalAgents_ResponseHasRequiredFields(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	// Verify required JSON keys are present
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&raw); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, key := range []string{"role", "agents", "main_agent_id"} {
		if _, ok := raw[key]; !ok {
			t.Fatalf("response missing field %q", key)
		}
	}
}

// ---------------------------------------------------------------------------
// PUT /api/internal-agents/orchestration
// ---------------------------------------------------------------------------

func TestHandleUpdateOrchestration_InvalidJSON(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodPut, "/api/internal-agents/orchestration",
		bytes.NewBufferString(`{not valid json`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestHandleUpdateOrchestration_MainAgentNotFound(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body := `{"main_agent_id":"nonexistent-agent"}`
	req := httptest.NewRequest(http.MethodPut, "/api/internal-agents/orchestration",
		bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestHandleUpdateOrchestration_EmptyBodySucceeds(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// No trusted gateway → currentActor returns "platform_admin" → admin role
	req := httptest.NewRequest(http.MethodPut, "/api/internal-agents/orchestration",
		bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestHandleUpdateOrchestration_ValidMainAgentID(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body := `{"main_agent_id":"vendas"}`
	req := httptest.NewRequest(http.MethodPut, "/api/internal-agents/orchestration",
		bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestHandleUpdateOrchestration_ProfileAndAssistantWhatsAppPersist(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	name := "Sofia Custom"
	payload, err := json.Marshal(updateOrchestrationRequest{
		AssistantWhatsAppJIDs:  []string{"55118888@s.whatsapp.net"},
		AssistantWhatsAppChats: []string{"120363000000000000@g.us"},
		AgentProfiles: map[string]agentProfileUpdate{
			orchestrator.AgentAssistant: {
				Name: &name,
				Avatar: &config.AgentAvatarConfig{
					Type:       "preset",
					Icon:       "assistant",
					Initials:   "SC",
					Background: "#6d28d9",
					Foreground: "#ffffff",
				},
			},
		},
		AgentRoleConfigs: map[string]config.AgentRoleConfig{
			orchestrator.AgentMarketing: {
				Version:     1,
				Kind:        "marketing",
				Description: "marketing custom",
				Marketing: &config.MarketingAgentRoleConfig{
					Platforms:        []string{"instagram", "site"},
					Deliverables:     []string{"post", "catalog_html"},
					ApprovalMode:     "owner_required",
					PublicPublishDir: "public/marketing",
					ContentPillars:   []string{"educativo", "prova_social"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/api/internal-agents/orchestration", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp internalAgentsResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.AssistantWhatsAppJIDs) != 1 || resp.AssistantWhatsAppJIDs[0] != "55118888@s.whatsapp.net" {
		t.Fatalf("assistant_whatsapp_jids = %#v", resp.AssistantWhatsAppJIDs)
	}
	if len(resp.AssistantWhatsAppChats) != 1 || resp.AssistantWhatsAppChats[0] != "120363000000000000@g.us" {
		t.Fatalf("assistant_whatsapp_chats = %#v", resp.AssistantWhatsAppChats)
	}

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}
	assistant, ok := findAgentConfig(cfg, orchestrator.AgentAssistant)
	if !ok {
		t.Fatal("expected assistente agent")
	}
	if assistant.Name != name {
		t.Fatalf("assistant name = %q, want %q", assistant.Name, name)
	}
	if assistant.Avatar == nil || assistant.Avatar.Initials != "SC" {
		t.Fatalf("assistant avatar = %#v, want initials SC", assistant.Avatar)
	}
	if assistant.Access == nil || len(assistant.Access.WhatsAppAllowedSenders) != 1 {
		t.Fatalf("assistant access = %#v", assistant.Access)
	}
	marketing, ok := findAgentConfig(cfg, orchestrator.AgentMarketing)
	if !ok {
		t.Fatal("expected marketing agent")
	}
	if marketing.RoleConfig == nil || marketing.RoleConfig.Marketing == nil {
		t.Fatalf("marketing role config = %#v", marketing.RoleConfig)
	}
	if marketing.RoleConfig.Marketing.PublicPublishDir != "public/marketing" {
		t.Fatalf("marketing publish dir = %q", marketing.RoleConfig.Marketing.PublicPublishDir)
	}
}

// ---------------------------------------------------------------------------
// GET /api/internal-agents/{agent_id}/sessions
// ---------------------------------------------------------------------------

func TestHandleInternalAgentSessions_AgentNotFound(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents/ghost-agent/sessions", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestHandleInternalAgentSessions_EmptyWorkspace(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents/vendas/sessions", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var items []map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected empty sessions list, got %d items", len(items))
	}
}

func TestHandleInternalAgentSessions_WithSessionFiles(t *testing.T) {
	configPath, agentWorkspace, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	// Create a fake session file
	sessionsDir := filepath.Join(agentWorkspace, "sessions")
	if err := os.MkdirAll(sessionsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sessionsDir, "chat-abc.jsonl"), []byte(`{}`), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents/vendas/sessions", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var items []map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 session, got %d", len(items))
	}
	if got := items[0]["id"]; got != "chat-abc" {
		t.Fatalf("session id = %q, want %q", got, "chat-abc")
	}
}

// ---------------------------------------------------------------------------
// GET /api/internal-agents/{agent_id}/proposals
// ---------------------------------------------------------------------------

func TestHandleInternalAgentProposals_AgentNotFound(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents/ghost-agent/proposals", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestHandleInternalAgentProposals_EmptyWorkspace(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents/vendas/proposals", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var items []json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected empty proposals list, got %d items", len(items))
	}
}

func TestHandleInternalAgentProposals_WithProposalFiles(t *testing.T) {
	configPath, agentWorkspace, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	proposalsDir := filepath.Join(agentWorkspace, "proposals")
	if err := os.MkdirAll(proposalsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	proposal := `{"title":"Test proposal","status":"pending"}`
	if err := os.WriteFile(filepath.Join(proposalsDir, "prop-1.json"), []byte(proposal), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/internal-agents/vendas/proposals", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var items []json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 proposal, got %d", len(items))
	}
	var p map[string]any
	if err := json.Unmarshal(items[0], &p); err != nil {
		t.Fatalf("unmarshal proposal: %v", err)
	}
	if got := p["title"]; got != "Test proposal" {
		t.Fatalf("proposal title = %q, want %q", got, "Test proposal")
	}
}

// ---------------------------------------------------------------------------
// POST /api/internal-agents/{agent_id}/turn
// ---------------------------------------------------------------------------

func TestHandleInternalAgentTurn_AgentNotFound(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body := `{"content":"hello"}`
	req := httptest.NewRequest(http.MethodPost, "/api/internal-agents/nonexistent/turn",
		bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestHandleInternalAgentTurn_EmptyContent(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body := `{"content":"   "}`
	req := httptest.NewRequest(http.MethodPost, "/api/internal-agents/vendas/turn",
		bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestHandleInternalAgentTurn_GatewayNotRunning(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	// Simulate residual global gateway state that another test or a real
	// launcher may have left. The handler must not use this cache when the
	// current PICOCLAW_HOME has no gateway pid file.
	gateway.mu.Lock()
	gateway.pidData = &ppid.PidFileData{
		PID:   os.Getpid(),
		Token: "stale-token-from-another-home",
		Host:  "127.0.0.1",
		Port:  18790,
	}
	gateway.mu.Unlock()
	t.Cleanup(func() {
		gateway.mu.Lock()
		gateway.pidData = nil
		gateway.mu.Unlock()
	})

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// Gateway is not running (no pidData / no pid file) → 503
	body := `{"content":"hello from test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/internal-agents/vendas/turn",
		bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusServiceUnavailable, rec.Body.String())
	}
}

func TestHandleInternalAgentTurn_InvalidJSON(t *testing.T) {
	configPath, _, cleanup := setupAgentsTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodPost, "/api/internal-agents/vendas/turn",
		bytes.NewBufferString(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}
