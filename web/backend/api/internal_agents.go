package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	saasPolicy "github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/pkg/config"
	ppid "github.com/sipeed/picoclaw/pkg/pid"
	"github.com/sipeed/picoclaw/pkg/routing"
	"github.com/sipeed/picoclaw/web/backend/middleware"
)

func (h *Handler) registerInternalAgentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/internal-agents", h.handleListInternalAgents)
	mux.HandleFunc("PUT /api/internal-agents/orchestration", h.handleUpdateInternalAgentOrchestration)
	mux.HandleFunc("POST /api/internal-agents/{agent_id}/turn", h.handleInternalAgentTurn)
	mux.HandleFunc("GET /api/internal-agents/{agent_id}/sessions", h.handleInternalAgentSessions)
	mux.HandleFunc("GET /api/internal-agents/{agent_id}/proposals", h.handleInternalAgentProposals)
}

type internalAgentSummary struct {
	ID        string                    `json:"id"`
	Name      string                    `json:"name"`
	Workspace string                    `json:"workspace,omitempty"`
	Default   bool                      `json:"default,omitempty"`
	Allowed   bool                      `json:"allowed"`
	Access    *config.AgentAccessConfig `json:"access,omitempty"`
	Subagents *config.SubagentsConfig   `json:"subagents,omitempty"`
}

type internalAgentsResponse struct {
	Role              string                 `json:"role"`
	Agents            []internalAgentSummary `json:"agents"`
	MainAgentID       string                 `json:"main_agent_id"`
	MainAllowAgents   []string               `json:"main_allow_agents"`
	AdminWhatsAppJIDs []string               `json:"admin_whatsapp_jids"`
}

type internalAgentTurnRequest struct {
	SessionID string `json:"session_id,omitempty"`
	Content   string `json:"content"`
}

type internalAgentTurnGatewayRequest struct {
	AgentID     string `json:"agent_id"`
	SessionID   string `json:"session_id,omitempty"`
	Content     string `json:"content"`
	ActorRole   string `json:"actor_role,omitempty"`
	ActorUserID string `json:"actor_user_id,omitempty"`
}

type internalAgentTurnGatewayResponse struct {
	AgentID   string `json:"agent_id"`
	SessionID string `json:"session_id"`
	Content   string `json:"content"`
}

type updateOrchestrationRequest struct {
	MainAgentID       string                              `json:"main_agent_id,omitempty"`
	MainAllowAgents   []string                            `json:"main_allow_agents"`
	AdminWhatsAppJIDs []string                            `json:"admin_whatsapp_jids"`
	AgentAccess       map[string]config.AgentAccessConfig `json:"agent_access,omitempty"`
}

func (h *Handler) handleListInternalAgents(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.loadOrchestrationConfig()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	role, _ := h.currentActor(r)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(h.internalAgentsResponse(cfg, role))
}

func (h *Handler) handleUpdateInternalAgentOrchestration(w http.ResponseWriter, r *http.Request) {
	role, _ := h.currentActor(r)
	if !isInternalAgentAdminRole(role) {
		writeJSONError(w, http.StatusForbidden, "role cannot update agent orchestration")
		return
	}
	cfg, err := h.loadOrchestrationConfig()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var body updateOrchestrationRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.MainAgentID) != "" && !orchestrator.SetMainAgent(cfg, body.MainAgentID) {
		writeJSONError(w, http.StatusBadRequest, "main agent not found")
		return
	}
	for i := range cfg.Agents.List {
		id := routing.NormalizeAgentID(cfg.Agents.List[i].ID)
		if next, ok := body.AgentAccess[id]; ok {
			cp := next
			cfg.Agents.List[i].Access = &cp
		}
	}
	mainID := orchestrator.MainAgentID(cfg)
	for i := range cfg.Agents.List {
		if routing.NormalizeAgentID(cfg.Agents.List[i].ID) != mainID {
			continue
		}
		if cfg.Agents.List[i].Access == nil {
			cfg.Agents.List[i].Access = &config.AgentAccessConfig{}
		}
		cfg.Agents.List[i].Access.WhatsAppAllowedSenders = append([]string(nil), body.AdminWhatsAppJIDs...)
	}
	orchestrator.SetMainAllowAgents(cfg, body.MainAllowAgents)
	orchestrator.EnsureSpecialistConfig(cfg)
	if err := config.SaveConfig(h.configPath, cfg); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := orchestrator.EnsureWorkspaceFiles(cfg); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(h.internalAgentsResponse(cfg, role))
}

func (h *Handler) handleInternalAgentTurn(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.loadOrchestrationConfig()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	role, actorID := h.currentActor(r)
	agentID := routing.NormalizeAgentID(r.PathValue("agent_id"))
	agentCfg, ok := findAgentConfig(cfg, agentID)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "agent not found")
		return
	}
	if !orchestrator.PanelAllowed(agentCfg, role) {
		writeJSONError(w, http.StatusForbidden, "role cannot call this internal agent")
		return
	}
	var body internalAgentTurnRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Content) == "" {
		writeJSONError(w, http.StatusBadRequest, "content is required")
		return
	}
	token := h.gatewayInternalToken()
	if token == "" {
		writeJSONError(w, http.StatusServiceUnavailable, "gateway is not running")
		return
	}
	target := h.gatewayProxyURL()
	target.Path = "/internal/agent-turn"
	payload, _ := json.Marshal(internalAgentTurnGatewayRequest{
		AgentID:     agentID,
		SessionID:   body.SessionID,
		Content:     body.Content,
		ActorRole:   role,
		ActorUserID: actorID,
	})
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target.String(), bytes.NewReader(payload))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	client := http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "failed to reach gateway: "+err.Error())
		return
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(data)
}

func (h *Handler) handleInternalAgentSessions(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.loadOrchestrationConfig()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	role, _ := h.currentActor(r)
	agentCfg, ok := findAgentConfig(cfg, r.PathValue("agent_id"))
	if !ok {
		writeJSONError(w, http.StatusNotFound, "agent not found")
		return
	}
	if !orchestrator.PanelAllowed(agentCfg, role) {
		writeJSONError(w, http.StatusForbidden, "role cannot view this internal agent")
		return
	}
	items := make([]map[string]any, 0)
	for _, pattern := range []string{"*.jsonl", "*.json"} {
		files, _ := filepath.Glob(filepath.Join(agentCfg.Workspace, "sessions", pattern))
		for _, file := range files {
			info, err := os.Stat(file)
			if err != nil || info.IsDir() {
				continue
			}
			items = append(items, map[string]any{
				"id":       strings.TrimSuffix(filepath.Base(file), filepath.Ext(file)),
				"updated":  info.ModTime().UTC().Format(time.RFC3339),
				"filename": filepath.Base(file),
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

func (h *Handler) handleInternalAgentProposals(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.loadOrchestrationConfig()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	role, _ := h.currentActor(r)
	agentCfg, ok := findAgentConfig(cfg, r.PathValue("agent_id"))
	if !ok {
		writeJSONError(w, http.StatusNotFound, "agent not found")
		return
	}
	if !orchestrator.PanelAllowed(agentCfg, role) {
		writeJSONError(w, http.StatusForbidden, "role cannot view this internal agent")
		return
	}
	files, _ := filepath.Glob(filepath.Join(agentCfg.Workspace, "proposals", "*.json"))
	items := make([]json.RawMessage, 0, len(files))
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		items = append(items, json.RawMessage(data))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

func (h *Handler) loadOrchestrationConfig() (*config.Config, error) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		return nil, err
	}
	if orchestrator.EnsureSpecialistConfig(cfg) {
		if err := config.SaveConfig(h.configPath, cfg); err != nil {
			return nil, err
		}
	}
	if err := orchestrator.EnsureWorkspaceFiles(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (h *Handler) internalAgentsResponse(cfg *config.Config, role string) internalAgentsResponse {
	agents := make([]internalAgentSummary, 0, len(cfg.Agents.List))
	adminJIDs := []string{}
	mainID := orchestrator.MainAgentID(cfg)
	for i := range cfg.Agents.List {
		agent := cfg.Agents.List[i]
		if routing.NormalizeAgentID(agent.ID) == mainID && agent.Access != nil {
			adminJIDs = append([]string(nil), agent.Access.WhatsAppAllowedSenders...)
		}
		allowed := orchestrator.PanelAllowed(agent, role)
		if !allowed {
			continue
		}
		agents = append(agents, internalAgentSummary{
			ID:        routing.NormalizeAgentID(agent.ID),
			Name:      firstNonEmpty(agent.Name, agent.ID),
			Workspace: agent.Workspace,
			Default:   agent.Default,
			Allowed:   allowed,
			Access:    agent.Access,
			Subagents: agent.Subagents,
		})
	}
	return internalAgentsResponse{
		Role:              role,
		Agents:            agents,
		MainAgentID:       mainID,
		MainAllowAgents:   orchestrator.MainAllowAgents(cfg),
		AdminWhatsAppJIDs: adminJIDs,
	}
}

func (h *Handler) currentActor(r *http.Request) (string, string) {
	if claims, ok := middleware.TrustedGatewayClaims(r); ok {
		return claims.Role, claims.UserID
	}
	return saasPolicy.RolePlatformAdmin, "local"
}

func isInternalAgentAdminRole(role string) bool {
	switch role {
	case saasPolicy.RoleTenantOwner, saasPolicy.RoleTenantAdmin, saasPolicy.RolePlatformAdmin:
		return true
	default:
		return false
	}
}

func findAgentConfig(cfg *config.Config, agentID string) (config.AgentConfig, bool) {
	agentID = routing.NormalizeAgentID(agentID)
	for _, agent := range cfg.Agents.List {
		if routing.NormalizeAgentID(agent.ID) == agentID {
			return agent, true
		}
	}
	return config.AgentConfig{}, false
}

func (h *Handler) gatewayInternalToken() string {
	gateway.mu.Lock()
	if gateway.pidData != nil && gateway.pidData.Token != "" {
		token := gateway.pidData.Token
		gateway.mu.Unlock()
		return token
	}
	gateway.mu.Unlock()
	if pidData := ppid.ReadPidFileWithCheck(globalConfigDir()); pidData != nil {
		return pidData.Token
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
