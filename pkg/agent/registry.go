package agent

import (
	"sync"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/providers"
	"github.com/sipeed/picoclaw/pkg/routing"
	"github.com/sipeed/picoclaw/pkg/tools"
)

// AgentRegistry manages multiple agent instances and routes messages to them.
type AgentRegistry struct {
	cfg        *config.Config
	agents     map[string]*AgentInstance
	resolver   *routing.RouteResolver
	mu         sync.RWMutex
	onboarding *onboardingDetector // nil quando Sofia não está registrada
}

// NewAgentRegistry creates a registry from config, instantiating all agents.
func NewAgentRegistry(
	cfg *config.Config,
	provider providers.LLMProvider,
) *AgentRegistry {
	registry := &AgentRegistry{
		cfg:      cfg,
		agents:   make(map[string]*AgentInstance),
		resolver: routing.NewRouteResolver(cfg),
	}

	agentConfigs := cfg.Agents.List
	if len(agentConfigs) == 0 {
		implicitAgent := &config.AgentConfig{
			ID:      "main",
			Default: true,
		}
		instance := NewAgentInstance(implicitAgent, &cfg.Agents.Defaults, cfg, provider)
		registry.agents["main"] = instance
		logger.InfoCF("agent", "Created implicit main agent (no agents.list configured)", nil)
	} else {
		for i := range agentConfigs {
			ac := &agentConfigs[i]
			if !ac.IsEnabled() {
				logger.InfoCF("agent", "Skipped disabled agent", map[string]any{
					"agent_id": routing.NormalizeAgentID(ac.ID),
					"name":     ac.Name,
				})
				continue
			}
			id := orchestrator.CanonicalAgentID(ac.ID)
			instance := NewAgentInstance(ac, &cfg.Agents.Defaults, cfg, provider)
			instance.ID = id
			registry.agents[id] = instance
			logger.InfoCF("agent", "Registered agent",
				map[string]any{
					"agent_id":  id,
					"name":      ac.Name,
					"workspace": instance.Workspace,
					"model":     instance.Model,
				})
		}
		if len(registry.agents) == 0 {
			implicitAgent := &config.AgentConfig{
				ID:      "main",
				Default: true,
			}
			instance := NewAgentInstance(implicitAgent, &cfg.Agents.Defaults, cfg, provider)
			registry.agents["main"] = instance
			logger.WarnCF("agent", "Created implicit main agent because all configured agents are disabled", nil)
		}
	}

	for _, instance := range registry.agents {
		if instance.ContextBuilder != nil {
			instance.ContextBuilder.WithAgentDiscovery(instance.ID, registry.ListSpawnableAgents)
			if err := instance.ContextBuilder.RegisterPromptContributor(privilegedWhatsAppAgentDiscoveryPromptContributor{
				agentID:  instance.ID,
				cfg:      cfg,
				registry: registry,
			}); err != nil {
				logger.WarnCF("agent", "Failed to register privileged WhatsApp discovery prompt contributor", map[string]any{
					"agent_id": instance.ID,
					"error":    err.Error(),
				})
			}
		}
	}

	// Onboarding default-override: ativa apenas quando Sofia está
	// registrada no tenant. Detector lê memory/empresa.md do workspace
	// principal — se ainda em template (Nome:/Segmento: vazios ou
	// "Status: pendente de validação"), Sofia vira default agent até o
	// dono completar o cadastro. Ver pkg/agent/onboarding_default.go.
	if _, hasSofia := registry.agents[onboardingAgentID]; hasSofia {
		mainWorkspace := cfg.Agents.Defaults.Workspace
		if mainWorkspace != "" {
			registry.onboarding = newOnboardingDetector(mainWorkspace)
			logger.InfoCF("agent", "Onboarding default-override enabled (Sofia present)", map[string]any{
				"workspace": mainWorkspace,
			})
		}
	}

	return registry
}

// GetAgent returns the agent instance for a given ID.
func (r *AgentRegistry) GetAgent(agentID string) (*AgentInstance, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	id := orchestrator.CanonicalAgentID(agentID)
	agent, ok := r.agents[id]
	return agent, ok
}

// ResolveRoute determines which agent handles the normalized inbound context.
func (r *AgentRegistry) ResolveRoute(inbound bus.InboundContext) routing.ResolvedRoute {
	return r.resolver.ResolveRoute(inbound)
}

// ListAgentIDs returns all registered agent IDs.
func (r *AgentRegistry) ListAgentIDs() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0, len(r.agents))
	for id := range r.agents {
		ids = append(ids, id)
	}
	return ids
}

func (r *AgentRegistry) allowedMCPServers() map[string]struct{} {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if len(r.agents) == 0 {
		return nil
	}

	union := make(map[string]struct{})
	for _, agent := range r.agents {
		if agent == nil {
			continue
		}
		if agent.MCPServerAllowlist == nil {
			return nil
		}
		for serverName := range agent.MCPServerAllowlist {
			union[serverName] = struct{}{}
		}
	}

	return union
}

// CanSpawnSubagent checks if parentAgentID is allowed to spawn targetAgentID.
func (r *AgentRegistry) CanSpawnSubagent(parentAgentID, targetAgentID string) bool {
	parent, ok := r.GetAgent(parentAgentID)
	if !ok {
		return false
	}
	return agentAllowsSubagent(parent, orchestrator.CanonicalAgentID(targetAgentID))
}

func agentAllowsSubagent(parent *AgentInstance, targetNorm string) bool {
	if parent == nil || parent.Subagents == nil || parent.Subagents.AllowAgents == nil {
		return false
	}
	for _, allowed := range parent.Subagents.AllowAgents {
		if allowed == "*" {
			return true
		}
		if orchestrator.CanonicalAgentID(allowed) == targetNorm {
			return true
		}
	}
	return false
}

func agentHasSpawnTool(agent *AgentInstance) bool {
	if agent == nil || agent.Tools == nil {
		return false
	}
	if _, ok := agent.Tools.Get("spawn"); ok {
		return true
	}
	_, ok := agent.Tools.Get("delegate")
	return ok
}

// ForEachTool calls fn for every tool registered under the given name
// across all agents. This is useful for propagating dependencies (e.g.
// MediaStore) to tools after registry construction.
func (r *AgentRegistry) ForEachTool(name string, fn func(tools.Tool)) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, agent := range r.agents {
		if t, ok := agent.Tools.Get(name); ok {
			fn(t)
		}
	}
}

// Close releases resources held by all registered agents.
func (r *AgentRegistry) Close() {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, agent := range r.agents {
		if err := agent.Close(); err != nil {
			logger.WarnCF("agent", "Failed to close agent",
				map[string]any{"agent_id": agent.ID, "error": err.Error()})
		}
	}
}

// GetDefaultAgent returns the default agent instance.
//
// Onboarding override: quando Sofia está registrada E o cadastro da
// empresa está incompleto (memory/empresa.md vazio ou marcado pendente),
// Sofia age como default — isso captura heartbeat, mensagens de chat,
// outbound dispatch e tudo mais que depende do default agent. Quando o
// dono completa o cadastro, o default volta automaticamente pro
// configurado (geralmente Rafael/main).
func (r *AgentRegistry) GetDefaultAgent() *AgentInstance {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.onboarding != nil && r.onboarding.IsIncomplete() {
		if sofia, ok := r.agents[onboardingAgentID]; ok {
			return sofia
		}
	}
	if id := r.defaultAgentIDLocked(); id != "" {
		if agent, ok := r.agents[id]; ok {
			return agent
		}
	}
	for id := range r.agents {
		return r.agents[id]
	}
	return nil
}
