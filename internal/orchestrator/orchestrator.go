package orchestrator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	saasPolicy "github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/routing"
)

const (
	AgentMain      = "main"
	AgentSales     = "vendas"
	AgentMarketing = "marketing"
	AgentManager   = "gerente"

	generatedRulePrefix = "orchestrator:"
)

var SensitivePanelRoles = []string{
	saasPolicy.RoleTenantOwner,
	saasPolicy.RoleTenantAdmin,
	saasPolicy.RolePlatformAdmin,
}

// EnsureSpecialistConfig mutates cfg so the deterministic 4-agent
// orchestration baseline exists while preserving user-edited agents and
// custom dispatch rules.
func EnsureSpecialistConfig(cfg *config.Config) bool {
	if cfg == nil {
		return false
	}
	changed := false
	baseWorkspace := cfg.WorkspacePath()
	if strings.TrimSpace(baseWorkspace) == "" {
		baseWorkspace = filepath.Join(config.GetHome(), "workspace")
	}

	if ensureAgent(cfg, config.AgentConfig{
		ID:        AgentMain,
		Default:   true,
		Name:      "Atendente Principal",
		Workspace: baseWorkspace,
		Subagents: &config.SubagentsConfig{
			AllowAgents: []string{AgentSales},
		},
		Access: &config.AgentAccessConfig{
			PanelEnabled:          true,
			PanelRoles:            cloneRoles(SensitivePanelRoles),
			WhatsAppDirectEnabled: true,
		},
	}) {
		changed = true
	}
	if ensureAgent(cfg, config.AgentConfig{
		ID:        AgentSales,
		Name:      "Vendas",
		Workspace: derivedWorkspace(baseWorkspace, AgentSales),
		Access: &config.AgentAccessConfig{
			PanelEnabled: true,
			PanelRoles:   cloneRoles(SensitivePanelRoles),
		},
	}) {
		changed = true
	}
	if ensureAgent(cfg, config.AgentConfig{
		ID:        AgentMarketing,
		Name:      "Marketing",
		Workspace: derivedWorkspace(baseWorkspace, AgentMarketing),
		Access: &config.AgentAccessConfig{
			PanelEnabled: true,
			PanelRoles:   cloneRoles(SensitivePanelRoles),
		},
	}) {
		changed = true
	}
	if ensureAgent(cfg, config.AgentConfig{
		ID:        AgentManager,
		Name:      "Gerente",
		Workspace: derivedWorkspace(baseWorkspace, AgentManager),
		Access: &config.AgentAccessConfig{
			PanelEnabled: true,
			PanelRoles:   cloneRoles(SensitivePanelRoles),
		},
	}) {
		changed = true
	}

	if ensureDefaultAgent(cfg) {
		changed = true
	}
	if rebuildGeneratedDispatchRules(cfg) {
		changed = true
	}
	return changed
}

func ensureAgent(cfg *config.Config, def config.AgentConfig) bool {
	def.ID = routing.NormalizeAgentID(def.ID)
	for i := range cfg.Agents.List {
		if routing.NormalizeAgentID(cfg.Agents.List[i].ID) != def.ID {
			continue
		}
		return mergeAgentDefaults(&cfg.Agents.List[i], def)
	}
	cfg.Agents.List = append(cfg.Agents.List, def)
	return true
}

func mergeAgentDefaults(agent *config.AgentConfig, def config.AgentConfig) bool {
	changed := false
	normalizedID := routing.NormalizeAgentID(agent.ID)
	if agent.ID != normalizedID {
		agent.ID = normalizedID
		changed = true
	}
	if strings.TrimSpace(agent.Name) == "" && def.Name != "" {
		agent.Name = def.Name
		changed = true
	}
	if strings.TrimSpace(agent.Workspace) == "" && def.Workspace != "" {
		agent.Workspace = def.Workspace
		changed = true
	}
	if agent.Subagents == nil && def.Subagents != nil {
		cp := *def.Subagents
		cp.AllowAgents = append([]string(nil), def.Subagents.AllowAgents...)
		agent.Subagents = &cp
		changed = true
	}
	if agent.Access == nil && def.Access != nil {
		cp := *def.Access
		cp.PanelRoles = append([]string(nil), def.Access.PanelRoles...)
		cp.WhatsAppAllowedSenders = append([]string(nil), def.Access.WhatsAppAllowedSenders...)
		agent.Access = &cp
		changed = true
	} else if agent.Access != nil {
		if agent.Access.PanelEnabled && len(agent.Access.PanelRoles) == 0 {
			agent.Access.PanelRoles = cloneRoles(SensitivePanelRoles)
			changed = true
		}
		if normalizedID == AgentMain && !agent.Access.WhatsAppDirectEnabled {
			agent.Access.WhatsAppDirectEnabled = true
			changed = true
		}
	}
	return changed
}

// MainAgentID returns the configured primary agent. The legacy ID remains
// "main", but the primary role is now driven by the agent marked default.
func MainAgentID(cfg *config.Config) string {
	if cfg == nil {
		return AgentMain
	}
	for _, agent := range cfg.Agents.List {
		if !agent.Default {
			continue
		}
		if id := normalizeConfiguredAgentID(agent.ID); id != "" {
			return id
		}
	}
	for _, agent := range cfg.Agents.List {
		if normalizeConfiguredAgentID(agent.ID) == AgentMain {
			return AgentMain
		}
	}
	for _, agent := range cfg.Agents.List {
		if id := normalizeConfiguredAgentID(agent.ID); id != "" {
			return id
		}
	}
	return AgentMain
}

// SetMainAgent marks exactly one configured agent as the primary/default
// agent. It returns false when the requested agent does not exist.
func SetMainAgent(cfg *config.Config, agentID string) bool {
	target := normalizeConfiguredAgentID(agentID)
	if cfg == nil || target == "" {
		return false
	}
	found := false
	for i := range cfg.Agents.List {
		id := normalizeConfiguredAgentID(cfg.Agents.List[i].ID)
		if id != target {
			cfg.Agents.List[i].Default = false
			continue
		}
		cfg.Agents.List[i].Default = true
		found = true
	}
	return found
}

func ensureDefaultAgent(cfg *config.Config) bool {
	changed := false
	mainID := MainAgentID(cfg)
	defaultSet := false
	for i := range cfg.Agents.List {
		id := normalizeConfiguredAgentID(cfg.Agents.List[i].ID)
		if id == mainID && !defaultSet {
			defaultSet = true
			if !cfg.Agents.List[i].Default {
				cfg.Agents.List[i].Default = true
				changed = true
			}
			continue
		}
		if cfg.Agents.List[i].Default {
			cfg.Agents.List[i].Default = false
			changed = true
		}
	}
	return changed
}

func normalizeConfiguredAgentID(agentID string) string {
	if strings.TrimSpace(agentID) == "" {
		return ""
	}
	return routing.NormalizeAgentID(agentID)
}

func rebuildGeneratedDispatchRules(cfg *config.Config) bool {
	if cfg.Agents.Dispatch == nil {
		cfg.Agents.Dispatch = &config.DispatchConfig{}
	}

	custom := make([]config.DispatchRule, 0, len(cfg.Agents.Dispatch.Rules))
	for _, rule := range cfg.Agents.Dispatch.Rules {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(rule.Name)), generatedRulePrefix) {
			continue
		}
		custom = append(custom, rule)
	}

	generated := buildGeneratedDispatchRules(cfg)
	next := append(generated, custom...)
	if dispatchRulesEqual(cfg.Agents.Dispatch.Rules, next) {
		return false
	}
	cfg.Agents.Dispatch.Rules = next
	return true
}

func buildGeneratedDispatchRules(cfg *config.Config) []config.DispatchRule {
	rules := make([]config.DispatchRule, 0, len(cfg.Agents.List)+4)
	mainID := MainAgentID(cfg)
	for _, agent := range cfg.Agents.List {
		id := routing.NormalizeAgentID(agent.ID)
		if id == "" || agent.Access == nil || !agent.Access.WhatsAppDirectEnabled {
			continue
		}
		if id == mainID {
			continue
		}
		for _, sender := range normalizedWhatsAppSenders(agent.Access.WhatsAppAllowedSenders) {
			rules = append(rules, config.DispatchRule{
				Name:  fmt.Sprintf("%swhatsapp:%s:%s", generatedRulePrefix, id, sender),
				Agent: id,
				When: config.DispatchSelector{
					Channel: "whatsapp",
					Sender:  sender,
				},
				SessionDimensions: []string{"chat", "sender"},
			})
		}
	}

	rules = append(rules, config.DispatchRule{
		Name:  generatedRulePrefix + "whatsapp:main",
		Agent: mainID,
		When: config.DispatchSelector{
			Channel: "whatsapp",
		},
		SessionDimensions: []string{"chat"},
	})

	for _, agent := range cfg.Agents.List {
		id := routing.NormalizeAgentID(agent.ID)
		if id == "" || agent.Access == nil || !agent.Access.PanelEnabled {
			continue
		}
		rules = append(rules, config.DispatchRule{
			Name:  generatedRulePrefix + "panel:" + id,
			Agent: id,
			When: config.DispatchSelector{
				Channel: "panel",
				Space:   "agent:" + id,
			},
			SessionDimensions: []string{"space", "chat"},
		})
	}
	return rules
}

func normalizedWhatsAppSenders(senders []string) []string {
	out := make([]string, 0, len(senders))
	seen := map[string]struct{}{}
	for _, sender := range senders {
		sender = strings.ToLower(strings.TrimSpace(sender))
		if sender == "" {
			continue
		}
		if !strings.HasPrefix(sender, "whatsapp:") {
			sender = "whatsapp:" + sender
		}
		if _, ok := seen[sender]; ok {
			continue
		}
		seen[sender] = struct{}{}
		out = append(out, sender)
	}
	return out
}

func WhatsAppAdminSenderAllowed(cfg *config.Config, senderID string) bool {
	if cfg == nil {
		return false
	}
	mainID := MainAgentID(cfg)
	for _, agent := range cfg.Agents.List {
		if routing.NormalizeAgentID(agent.ID) != mainID || agent.Access == nil {
			continue
		}
		return senderInWhatsAppList(senderID, agent.Access.WhatsAppAllowedSenders)
	}
	return false
}

func senderInWhatsAppList(senderID string, allowed []string) bool {
	candidate := strings.ToLower(strings.TrimSpace(senderID))
	if candidate == "" {
		return false
	}
	candidates := map[string]struct{}{
		candidate:               {},
		"whatsapp:" + candidate: {},
	}
	if strings.HasPrefix(candidate, "whatsapp:") {
		candidates[strings.TrimPrefix(candidate, "whatsapp:")] = struct{}{}
	}
	for _, allowedSender := range normalizedWhatsAppSenders(allowed) {
		if _, ok := candidates[allowedSender]; ok {
			return true
		}
		if strings.HasPrefix(allowedSender, "whatsapp:") {
			if _, ok := candidates[strings.TrimPrefix(allowedSender, "whatsapp:")]; ok {
				return true
			}
		}
	}
	return false
}

func dispatchRulesEqual(a, b []config.DispatchRule) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Name != b[i].Name ||
			a[i].Agent != b[i].Agent ||
			a[i].When != b[i].When ||
			!stringSlicesEqual(a[i].SessionDimensions, b[i].SessionDimensions) {
			return false
		}
	}
	return true
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func derivedWorkspace(baseWorkspace, agentID string) string {
	baseWorkspace = strings.TrimSpace(baseWorkspace)
	if baseWorkspace == "" {
		return ""
	}
	dir := filepath.Dir(baseWorkspace)
	name := filepath.Base(baseWorkspace)
	if name == "." || name == string(filepath.Separator) {
		name = "workspace"
	}
	return filepath.Join(dir, name+"-"+agentID)
}

func cloneRoles(roles []string) []string {
	return append([]string(nil), roles...)
}

// PanelAllowed returns whether role may see or call the agent from the
// internal dashboard agent surface. Platform admins bypass per-agent lists.
func PanelAllowed(agent config.AgentConfig, role string) bool {
	if role == saasPolicy.RolePlatformAdmin {
		return true
	}
	if agent.Access == nil || !agent.Access.PanelEnabled {
		return false
	}
	role = strings.TrimSpace(role)
	for _, allowed := range agent.Access.PanelRoles {
		if role == strings.TrimSpace(allowed) {
			return true
		}
	}
	return false
}

func MainAllowAgents(cfg *config.Config) []string {
	mainID := MainAgentID(cfg)
	for _, agent := range cfg.Agents.List {
		if routing.NormalizeAgentID(agent.ID) != mainID || agent.Subagents == nil {
			continue
		}
		return append([]string(nil), agent.Subagents.AllowAgents...)
	}
	return nil
}

func SetMainAllowAgents(cfg *config.Config, allow []string) {
	mainID := MainAgentID(cfg)
	for i := range cfg.Agents.List {
		if routing.NormalizeAgentID(cfg.Agents.List[i].ID) != mainID {
			continue
		}
		if cfg.Agents.List[i].Subagents == nil {
			cfg.Agents.List[i].Subagents = &config.SubagentsConfig{}
		}
		cfg.Agents.List[i].Subagents.AllowAgents = normalizeAgentList(allow)
		return
	}
}

func normalizeAgentList(ids []string) []string {
	out := make([]string, 0, len(ids))
	seen := map[string]struct{}{}
	for _, id := range ids {
		id = routing.NormalizeAgentID(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// EnsureWorkspaceFiles creates initial AGENT.md/SOUL.md files for the
// specialist workspaces without overwriting tenant customizations.
func EnsureWorkspaceFiles(cfg *config.Config) error {
	if cfg == nil {
		return nil
	}
	for _, agent := range cfg.Agents.List {
		id := routing.NormalizeAgentID(agent.ID)
		if id == "" || strings.TrimSpace(agent.Workspace) == "" {
			continue
		}
		if err := ensureAgentWorkspaceFile(agent.Workspace, id); err != nil {
			return err
		}
	}
	return nil
}

func ensureAgentWorkspaceFile(workspace, agentID string) error {
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		return err
	}
	agentPath := filepath.Join(workspace, "AGENT.md")
	if _, err := os.Stat(agentPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.WriteFile(agentPath, []byte(defaultAgentPrompt(agentID)), 0o644); err != nil {
		return err
	}
	soulPath := filepath.Join(workspace, "SOUL.md")
	if _, err := os.Stat(soulPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.WriteFile(soulPath, []byte(defaultAgentSoul(agentID)), 0o644)
}

func defaultAgentPrompt(agentID string) string {
	switch agentID {
	case AgentSales:
		return `---
name: Vendas
description: Especialista em negociacao, qualificacao de leads e proximas acoes comerciais.
---

# Vendas

Voce e o agente especialista comercial. Negocie com clareza, qualifique leads, trate objecoes, classifique o estagio da oportunidade e entregue ao agente principal um resumo acionavel com proxima acao recomendada.
`
	case AgentMarketing:
		return `---
name: Marketing
description: Especialista em campanhas, conteudo, tendencias, posicionamento e assets de marca.
---

# Marketing

Voce e o agente especialista de marketing. Crie campanhas, posts para Instagram, calendarios editoriais, catalogos, ideias de sites simples e propostas de posicionamento. Quando precisar de imagem real, use generate_image. Salve campanhas e assets relevantes com save_marketing_proposal.
`
	case AgentManager:
		return `---
name: Gerente
description: Agente administrativo para configuracoes, relatorios, metricas e ajustes controlados do workspace.
---

# Gerente

Voce e o gerente interno do workspace. Ajude owners e admins a alterar informacoes da empresa, comportamento dos agentes, permissoes de subagentes, relatorios e metricas. Use tenant_manager apenas para mudancas permitidas e auditaveis.
`
	default:
		return `---
name: Atendente Principal
description: Porta de entrada publica para atendimento, triagem e informacoes da empresa.
---

# Atendente Principal

Voce atende o publico pelo WhatsApp. Responda duvidas gerais, faca triagem, explique informacoes e valores publicos da empresa. Quando detectar uma demanda de vendas, chame internamente um especialista permitido pela configuracao e responda ao cliente mantendo uma experiencia unica, sem expor troca de persona.
`
	}
}

func defaultAgentSoul(agentID string) string {
	switch agentID {
	case AgentSales:
		return "Atue com postura consultiva, objetiva e orientada a conversao sem pressionar o cliente.\n"
	case AgentMarketing:
		return "Seja criativo, pratico e atento ao posicionamento real da marca antes de propor campanhas.\n"
	case AgentManager:
		return "Priorize seguranca, auditoria e mudancas pequenas, reversiveis e claramente explicadas.\n"
	default:
		return "Seja cordial, claro e util. Proteja o contexto interno e mantenha a conversa simples para o cliente.\n"
	}
}
