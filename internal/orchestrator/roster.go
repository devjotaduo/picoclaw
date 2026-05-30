package orchestrator

import (
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
)

// This file implements the v2.0 declarative roster path. When
// config.Agents.Roster is non-empty, EnsureSpecialistConfig materializes ONLY
// the named agents (e.g. a vertical tenant's ["attendant","assistant"]) instead
// of the canonical 4-agent baseline. It reuses the same role/avatar/workspace
// builders as the legacy seed so both paths agree on agent shape.

// ensureRosterConfig materializes exactly the agents named in cfg.Agents.Roster.
// main is always included so unrouted messages have a default agent. Returns
// true when it mutated cfg.
func ensureRosterConfig(cfg *config.Config) bool {
	changed := false
	baseWorkspace := cfg.WorkspacePath()
	if strings.TrimSpace(baseWorkspace) == "" {
		baseWorkspace = filepath.Join(config.GetHome(), "workspace")
	}
	if migrateLegacyManagerAgent(cfg, baseWorkspace) {
		changed = true
	}

	ids := rosterAgentIDs(cfg.Agents.Roster)
	hasMain := false
	for _, id := range ids {
		if id == AgentMain {
			hasMain = true
			break
		}
	}
	if !hasMain {
		ids = append([]string{AgentMain}, ids...)
	}

	for _, id := range ids {
		if ensureAgent(cfg, rosterAgentDef(baseWorkspace, id)) {
			changed = true
		}
	}
	if ensureDefaultAgent(cfg) {
		changed = true
	}
	if rebuildGeneratedDispatchRules(cfg) {
		changed = true
	}
	return changed
}

// rosterAgentIDs maps roster role names to canonical agent ids, dedups, and
// preserves declaration order. Unknown roles are dropped.
func rosterAgentIDs(roster []string) []string {
	out := make([]string, 0, len(roster))
	seen := make(map[string]bool, len(roster))
	for _, r := range roster {
		id := rosterRoleToAgentID(r)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// rosterRoleToAgentID translates the admin-facing role vocabulary
// (attendant/assistant/...) into the runtime agent id. Returns "" for unknown
// roles so they're skipped rather than materializing a nameless agent.
//
// Note: AgentMain/AgentSales/AgentMarketing/AgentAssistant are themselves the
// lowercase literals "main"/"vendas"/"marketing"/"assistente", so we match the
// literal strings directly and only add the genuinely distinct aliases
// ("atendente", "assistant", legacy "gerente").
func rosterRoleToAgentID(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "attendant", "atendente", "main":
		return AgentMain
	case "assistant", "assistente", AgentManagerLegacy:
		return AgentAssistant
	case "sales", "vendas":
		return AgentSales
	case "marketing":
		return AgentMarketing
	default:
		return ""
	}
}

// rosterAgentDef builds the AgentConfig seed for one roster member. main is the
// default/attendant on the base workspace; every other agent gets a derived
// sibling workspace. Subagent allow-lists are filtered to roster members by
// enforceAgentSubagents on subsequent merges.
func rosterAgentDef(baseWorkspace, id string) config.AgentConfig {
	id = canonicalAgentID(id)
	def := config.AgentConfig{
		ID:         id,
		Avatar:     defaultAgentAvatar(id),
		RoleConfig: defaultAgentRoleConfig(id),
		Access: &config.AgentAccessConfig{
			PanelEnabled: true,
			PanelRoles:   cloneRoles(sensitivePanelRoles),
		},
	}
	switch id {
	case AgentMain:
		def.Default = true
		def.Name = "Atendente"
		def.Workspace = baseWorkspace
		def.Access.WhatsAppDirectEnabled = true
	case AgentAssistant:
		def.Name = "Assistente"
		def.Workspace = derivedWorkspace(baseWorkspace, AgentAssistant)
		def.Subagents = &config.SubagentsConfig{AllowAgents: []string{AgentMain}}
		def.Access.WhatsAppDirectEnabled = true
	default:
		def.Workspace = derivedWorkspace(baseWorkspace, id)
	}
	return def
}

// defaultDesiredSubagents returns the canonical sub-agents an agent may call.
// Shared by enforceAgentSubagents and the roster builder so both agree.
func defaultDesiredSubagents(agentID string) []string {
	switch canonicalAgentID(agentID) {
	case AgentMain:
		return []string{AgentSales}
	case AgentAssistant:
		return []string{AgentMain, AgentSales, AgentMarketing}
	default:
		return nil
	}
}

// filterExistingAgents drops ids not present in cfg.Agents.List, preserving
// order. Nil cfg returns the input unchanged (defensive; callers pass a real
// cfg). This keeps a 2-agent roster from referencing vendas/marketing that were
// never materialized, so the result is stable across reboots.
func filterExistingAgents(cfg *config.Config, ids []string) []string {
	if cfg == nil {
		return ids
	}
	exists := make(map[string]bool, len(cfg.Agents.List))
	for _, a := range cfg.Agents.List {
		exists[canonicalAgentID(a.ID)] = true
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if exists[canonicalAgentID(id)] {
			out = append(out, id)
		}
	}
	return out
}
