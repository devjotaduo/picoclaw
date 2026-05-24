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
	AgentAssistant = "assistente"

	// AgentManager is kept as a temporary source-compatible alias for older
	// code paths and tests. User-facing orchestration should use AgentAssistant.
	AgentManager       = AgentAssistant
	AgentManagerLegacy = "gerente"

	generatedRulePrefix = "orchestrator:"
)

var sensitivePanelRoles = []string{
	saasPolicy.RoleTenantOwner,
	saasPolicy.RoleTenantAdmin,
	saasPolicy.RolePlatformAdmin,
}

// EnsureSpecialistConfig mutates cfg so the deterministic 4-agent
// orchestration baseline exists while preserving user-edited agents and
// custom dispatch rules.
//
// Opt-out: setting agents.skip_specialist_seed=true skips ALL mutations.
// Use this for single-home tenants with a fully custom roster where the
// canonical Ana/Leo/Maya/Sofia injection would conflict with the local
// agents (e.g. tenant has its own "marcos" for sales, doesn't want "vendas"
// added too). SaaS multi-tenant deployments leave this false to keep the
// guaranteed orchestration topology.
func EnsureSpecialistConfig(cfg *config.Config) bool {
	if cfg == nil {
		return false
	}
	if cfg.Agents.SkipSpecialistSeed {
		return false
	}
	changed := false
	baseWorkspace := cfg.WorkspacePath()
	if strings.TrimSpace(baseWorkspace) == "" {
		baseWorkspace = filepath.Join(config.GetHome(), "workspace")
	}
	if migrateLegacyManagerAgent(cfg, baseWorkspace) {
		changed = true
	}

	if ensureAgent(cfg, config.AgentConfig{
		ID:         AgentMain,
		Default:    true,
		Name:       "Ana",
		Avatar:     defaultAgentAvatar(AgentMain),
		RoleConfig: defaultAgentRoleConfig(AgentMain),
		Workspace:  baseWorkspace,
		Subagents: &config.SubagentsConfig{
			AllowAgents: []string{AgentSales},
		},
		Access: &config.AgentAccessConfig{
			PanelEnabled:          true,
			PanelRoles:            cloneRoles(sensitivePanelRoles),
			WhatsAppDirectEnabled: true,
		},
	}) {
		changed = true
	}
	if ensureAgent(cfg, config.AgentConfig{
		ID:         AgentSales,
		Name:       "Leo",
		Avatar:     defaultAgentAvatar(AgentSales),
		RoleConfig: defaultAgentRoleConfig(AgentSales),
		Workspace:  derivedWorkspace(baseWorkspace, AgentSales),
		Access: &config.AgentAccessConfig{
			PanelEnabled: true,
			PanelRoles:   cloneRoles(sensitivePanelRoles),
		},
	}) {
		changed = true
	}
	if ensureAgent(cfg, config.AgentConfig{
		ID:         AgentMarketing,
		Name:       "Maya",
		Avatar:     defaultAgentAvatar(AgentMarketing),
		RoleConfig: defaultAgentRoleConfig(AgentMarketing),
		Workspace:  derivedWorkspace(baseWorkspace, AgentMarketing),
		Access: &config.AgentAccessConfig{
			PanelEnabled: true,
			PanelRoles:   cloneRoles(sensitivePanelRoles),
		},
	}) {
		changed = true
	}
	if ensureAgent(cfg, config.AgentConfig{
		ID:         AgentAssistant,
		Name:       "Sofia",
		Avatar:     defaultAgentAvatar(AgentAssistant),
		RoleConfig: defaultAgentRoleConfig(AgentAssistant),
		Workspace:  derivedWorkspace(baseWorkspace, AgentAssistant),
		Subagents: &config.SubagentsConfig{
			AllowAgents: []string{AgentMain, AgentSales, AgentMarketing},
		},
		Access: &config.AgentAccessConfig{
			PanelEnabled:          true,
			PanelRoles:            cloneRoles(sensitivePanelRoles),
			WhatsAppDirectEnabled: true,
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
	def.ID = canonicalAgentID(def.ID)
	for i := range cfg.Agents.List {
		if canonicalAgentID(cfg.Agents.List[i].ID) != def.ID {
			continue
		}
		return mergeAgentDefaults(&cfg.Agents.List[i], def)
	}
	cfg.Agents.List = append(cfg.Agents.List, def)
	return true
}

func mergeAgentDefaults(agent *config.AgentConfig, def config.AgentConfig) bool {
	changed := false
	normalizedID := canonicalAgentID(agent.ID)
	if agent.ID != normalizedID {
		agent.ID = normalizedID
		changed = true
	}
	if shouldUseDefaultAgentName(normalizedID, agent.Name) && def.Name != "" {
		agent.Name = def.Name
		changed = true
	}
	if agent.Avatar == nil && def.Avatar != nil {
		agent.Avatar = cloneAgentAvatar(def.Avatar)
		changed = true
	}
	if mergeAgentRoleConfig(agent, def.RoleConfig) {
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
	if enforceAgentSubagents(normalizedID, agent) {
		changed = true
	}
	if agent.Access == nil && def.Access != nil {
		cp := *def.Access
		cp.PanelRoles = append([]string(nil), def.Access.PanelRoles...)
		cp.WhatsAppAllowedSenders = append([]string(nil), def.Access.WhatsAppAllowedSenders...)
		cp.WhatsAppAllowedChats = append([]string(nil), def.Access.WhatsAppAllowedChats...)
		agent.Access = &cp
		changed = true
	} else if agent.Access != nil {
		if agent.Access.PanelEnabled && len(agent.Access.PanelRoles) == 0 {
			agent.Access.PanelRoles = cloneRoles(sensitivePanelRoles)
			changed = true
		}
		if normalizedID == AgentMain && !agent.Access.WhatsAppDirectEnabled {
			agent.Access.WhatsAppDirectEnabled = true
			changed = true
		}
		if normalizedID == AgentAssistant {
			if !agent.Access.PanelEnabled {
				agent.Access.PanelEnabled = true
				changed = true
			}
			if len(agent.Access.PanelRoles) == 0 {
				agent.Access.PanelRoles = cloneRoles(sensitivePanelRoles)
				changed = true
			}
			if !agent.Access.WhatsAppDirectEnabled {
				agent.Access.WhatsAppDirectEnabled = true
				changed = true
			}
		}
	}
	return changed
}

func migrateLegacyManagerAgent(cfg *config.Config, baseWorkspace string) bool {
	assistantIdx := -1
	legacyIdx := -1
	for i := range cfg.Agents.List {
		switch routing.NormalizeAgentID(cfg.Agents.List[i].ID) {
		case AgentAssistant:
			assistantIdx = i
		case AgentManagerLegacy:
			legacyIdx = i
		}
	}
	if legacyIdx < 0 {
		return false
	}
	if assistantIdx < 0 {
		cfg.Agents.List[legacyIdx].ID = AgentAssistant
		if shouldUseDefaultAgentName(AgentAssistant, cfg.Agents.List[legacyIdx].Name) {
			cfg.Agents.List[legacyIdx].Name = "Sofia"
		}
		if strings.TrimSpace(cfg.Agents.List[legacyIdx].Workspace) == "" {
			cfg.Agents.List[legacyIdx].Workspace = derivedWorkspace(baseWorkspace, AgentAssistant)
		}
		if cfg.Agents.List[legacyIdx].Avatar == nil {
			cfg.Agents.List[legacyIdx].Avatar = defaultAgentAvatar(AgentAssistant)
		}
		if cfg.Agents.List[legacyIdx].RoleConfig == nil {
			cfg.Agents.List[legacyIdx].RoleConfig = defaultAgentRoleConfig(AgentAssistant)
		}
		return true
	}
	legacy := cfg.Agents.List[legacyIdx]
	assistant := &cfg.Agents.List[assistantIdx]
	if legacy.Default {
		assistant.Default = true
	}
	if strings.TrimSpace(assistant.Workspace) == "" && strings.TrimSpace(legacy.Workspace) != "" {
		assistant.Workspace = legacy.Workspace
	}
	if assistant.Access == nil && legacy.Access != nil {
		cp := *legacy.Access
		cp.PanelRoles = append([]string(nil), legacy.Access.PanelRoles...)
		cp.WhatsAppAllowedSenders = append([]string(nil), legacy.Access.WhatsAppAllowedSenders...)
		cp.WhatsAppAllowedChats = append([]string(nil), legacy.Access.WhatsAppAllowedChats...)
		assistant.Access = &cp
	}
	if assistant.Subagents == nil && legacy.Subagents != nil {
		cp := *legacy.Subagents
		cp.AllowAgents = append([]string(nil), legacy.Subagents.AllowAgents...)
		assistant.Subagents = &cp
	}
	if assistant.RoleConfig == nil && legacy.RoleConfig != nil {
		assistant.RoleConfig = cloneAgentRoleConfig(legacy.RoleConfig)
	}
	cfg.Agents.List = append(cfg.Agents.List[:legacyIdx], cfg.Agents.List[legacyIdx+1:]...)
	return true
}

func canonicalAgentID(agentID string) string {
	id := routing.NormalizeAgentID(agentID)
	if id == AgentManagerLegacy {
		return AgentAssistant
	}
	return id
}

func CanonicalAgentID(agentID string) string {
	return canonicalAgentID(agentID)
}

func shouldUseDefaultAgentName(agentID, current string) bool {
	name := strings.TrimSpace(strings.ToLower(current))
	if name == "" {
		return true
	}
	switch canonicalAgentID(agentID) {
	case AgentMain:
		return name == "atendente principal" || name == "ana - atendente virtual"
	case AgentSales:
		return name == "vendas" || name == "consultor de vendas"
	case AgentMarketing:
		return name == "marketing" || name == "estrategista instagram"
	case AgentAssistant:
		return name == "gerente" || name == "assistente do dono" || name == "assistente"
	default:
		return false
	}
}

func enforceAgentSubagents(agentID string, agent *config.AgentConfig) bool {
	var desired []string
	switch canonicalAgentID(agentID) {
	case AgentMain:
		desired = []string{AgentSales}
	case AgentAssistant:
		desired = []string{AgentMain, AgentSales, AgentMarketing}
	default:
		return false
	}
	if agent.Subagents == nil {
		agent.Subagents = &config.SubagentsConfig{AllowAgents: desired}
		return true
	}
	normalized := normalizeAgentList(agent.Subagents.AllowAgents)
	if stringSlicesEqual(normalized, desired) {
		if !stringSlicesEqual(agent.Subagents.AllowAgents, normalized) {
			agent.Subagents.AllowAgents = normalized
			return true
		}
		return false
	}
	agent.Subagents.AllowAgents = desired
	return true
}

func defaultAgentAvatar(agentID string) *config.AgentAvatarConfig {
	switch canonicalAgentID(agentID) {
	case AgentSales:
		return &config.AgentAvatarConfig{Type: "preset", Icon: "target", Initials: "LE", Background: "#16a34a", Foreground: "#ffffff"}
	case AgentMarketing:
		return &config.AgentAvatarConfig{Type: "preset", Icon: "sparkles", Initials: "MA", Background: "#f43f5e", Foreground: "#ffffff"}
	case AgentAssistant:
		return &config.AgentAvatarConfig{Type: "preset", Icon: "assistant", Initials: "SO", Background: "#7c3aed", Foreground: "#ffffff"}
	default:
		return &config.AgentAvatarConfig{Type: "preset", Icon: "headset", Initials: "AN", Background: "#2563eb", Foreground: "#ffffff"}
	}
}

func cloneAgentAvatar(src *config.AgentAvatarConfig) *config.AgentAvatarConfig {
	if src == nil {
		return nil
	}
	cp := *src
	return &cp
}

func mergeAgentRoleConfig(agent *config.AgentConfig, def *config.AgentRoleConfig) bool {
	if def == nil {
		return false
	}
	if agent.RoleConfig == nil {
		agent.RoleConfig = cloneAgentRoleConfig(def)
		return true
	}
	changed := false
	if agent.RoleConfig.Version == 0 {
		agent.RoleConfig.Version = def.Version
		changed = true
	}
	if strings.TrimSpace(agent.RoleConfig.Kind) == "" {
		agent.RoleConfig.Kind = def.Kind
		changed = true
	}
	if strings.TrimSpace(agent.RoleConfig.Description) == "" {
		agent.RoleConfig.Description = def.Description
		changed = true
	}
	switch canonicalAgentID(agent.ID) {
	case AgentMain:
		if agent.RoleConfig.Attendant == nil && def.Attendant != nil {
			cp := *def.Attendant
			cp.Departments = append([]string(nil), def.Attendant.Departments...)
			cp.TriageFields = append([]string(nil), def.Attendant.TriageFields...)
			cp.EscalationRules = append([]string(nil), def.Attendant.EscalationRules...)
			agent.RoleConfig.Attendant = &cp
			changed = true
		}
	case AgentSales:
		if agent.RoleConfig.Sales == nil && def.Sales != nil {
			cp := *def.Sales
			cp.FunnelStages = append([]string(nil), def.Sales.FunnelStages...)
			cp.QualificationFields = append([]string(nil), def.Sales.QualificationFields...)
			cp.FollowupCadence = append([]string(nil), def.Sales.FollowupCadence...)
			cp.HandoffRules = append([]string(nil), def.Sales.HandoffRules...)
			agent.RoleConfig.Sales = &cp
			changed = true
		}
	case AgentMarketing:
		if agent.RoleConfig.Marketing == nil && def.Marketing != nil {
			agent.RoleConfig.Marketing = cloneMarketingRoleConfig(def.Marketing)
			changed = true
		}
	case AgentAssistant:
		if agent.RoleConfig.Assistant == nil && def.Assistant != nil {
			cp := *def.Assistant
			cp.AuthorizedScopes = append([]string(nil), def.Assistant.AuthorizedScopes...)
			cp.ReportCadence = append([]string(nil), def.Assistant.ReportCadence...)
			cp.CanCallAgents = append([]string(nil), def.Assistant.CanCallAgents...)
			cp.RequiresConfirmation = append([]string(nil), def.Assistant.RequiresConfirmation...)
			agent.RoleConfig.Assistant = &cp
			changed = true
		}
	}
	return changed
}

func defaultAgentRoleConfig(agentID string) *config.AgentRoleConfig {
	switch canonicalAgentID(agentID) {
	case AgentMain:
		return &config.AgentRoleConfig{
			Version:     1,
			Kind:        "attendant",
			Description: "Atendente principal para informacoes, triagem, duvidas, encaminhamento e agendamento.",
			Attendant: &config.AttendantAgentRoleConfig{
				Departments:       []string{"vendas", "suporte", "financeiro", "agendamento", "humano"},
				TriageFields:      []string{"nome", "contato", "assunto", "urgencia", "melhor_canal"},
				EscalationRules:   []string{"reclamacao grave", "risco juridico", "cancelamento sensivel", "desconto ou excecao", "informacao nao confirmada"},
				SchedulingEnabled: true,
				FAQSource:         "company_context",
			},
		}
	case AgentSales:
		return &config.AgentRoleConfig{
			Version:     1,
			Kind:        "sales",
			Description: "Consultor comercial para qualificar leads, vender, registrar oportunidades e fazer follow-up.",
			Sales: &config.SalesAgentRoleConfig{
				FunnelStages:        []string{"novo", "qualificacao", "proposta", "follow_up", "ganho", "perdido"},
				QualificationFields: []string{"problema", "fit", "autoridade", "prazo", "orcamento", "proximo_passo"},
				FollowupCadence:     []string{"D+1", "D+3", "D+7"},
				CRMIntegration:      "future",
				PricePolicySource:   "memory/pricing.md",
				HandoffRules:        []string{"lead qualificado com prazo", "pedido de contrato", "excecao comercial", "duvida tecnica fora do escopo"},
			},
		}
	case AgentMarketing:
		return &config.AgentRoleConfig{
			Version:     1,
			Kind:        "marketing",
			Description: "Especialista de marketing para posts, campanhas, catalogos, sites simples, tendencias e materiais visuais.",
			Marketing: &config.MarketingAgentRoleConfig{
				Platforms:        []string{"instagram", "site", "catalog_html"},
				Deliverables:     []string{"post", "reel_cover", "carousel", "stories", "campaign", "calendar", "catalog_html", "simple_site"},
				ApprovalMode:     "owner_required",
				PublicPublishDir: "public/marketing",
				BrandKit: config.MarketingBrandKitConfig{
					Colors:      []string{},
					Fonts:       []string{},
					Tone:        "",
					VisualStyle: "",
				},
				ContentPillars:      []string{},
				Audiences:           []config.MarketingAudienceConfig{},
				Cadence:             config.MarketingCadenceConfig{PostsPerWeek: 3, CampaignsPerMonth: 1, PlanningHorizon: "1-4 weeks"},
				TrendSources:        []string{"instagram", "google_trends", "competitors"},
				Competitors:         []string{},
				DefaultImageSizes:   map[string]string{"instagram_feed": "1080x1350", "instagram_square": "1080x1080", "stories_reels": "1080x1920"},
				RequiresHumanReview: true,
			},
		}
	case AgentAssistant:
		return &config.AgentRoleConfig{
			Version:     1,
			Kind:        "assistant",
			Description: "Assistente do dono para agenda, relatorios, documentos, workspace e coordenacao dos agentes.",
			Assistant: &config.AssistantAgentRoleConfig{
				AuthorizedScopes:     []string{"workspace", "agents", "reports", "documents", "agenda", "orchestration"},
				ReportCadence:        []string{"daily", "weekly", "monthly"},
				CanEditAgents:        true,
				CanCallAgents:        []string{AgentMain, AgentSales, AgentMarketing},
				RequiresConfirmation: []string{"editar agentes", "alterar permissoes", "publicar materiais", "apagar arquivos", "enviar relatorios externos"},
				AuditLevel:           "high",
			},
		}
	default:
		return nil
	}
}

func cloneAgentRoleConfig(src *config.AgentRoleConfig) *config.AgentRoleConfig {
	if src == nil {
		return nil
	}
	cp := *src
	cp.Profile = cloneAnyMap(src.Profile)
	if src.Marketing != nil {
		cp.Marketing = cloneMarketingRoleConfig(src.Marketing)
	}
	if src.Sales != nil {
		sales := *src.Sales
		sales.FunnelStages = append([]string(nil), src.Sales.FunnelStages...)
		sales.QualificationFields = append([]string(nil), src.Sales.QualificationFields...)
		sales.FollowupCadence = append([]string(nil), src.Sales.FollowupCadence...)
		sales.HandoffRules = append([]string(nil), src.Sales.HandoffRules...)
		cp.Sales = &sales
	}
	if src.Attendant != nil {
		attendant := *src.Attendant
		attendant.Departments = append([]string(nil), src.Attendant.Departments...)
		attendant.TriageFields = append([]string(nil), src.Attendant.TriageFields...)
		attendant.EscalationRules = append([]string(nil), src.Attendant.EscalationRules...)
		cp.Attendant = &attendant
	}
	if src.Assistant != nil {
		assistant := *src.Assistant
		assistant.AuthorizedScopes = append([]string(nil), src.Assistant.AuthorizedScopes...)
		assistant.ReportCadence = append([]string(nil), src.Assistant.ReportCadence...)
		assistant.CanCallAgents = append([]string(nil), src.Assistant.CanCallAgents...)
		assistant.RequiresConfirmation = append([]string(nil), src.Assistant.RequiresConfirmation...)
		cp.Assistant = &assistant
	}
	return &cp
}

func cloneMarketingRoleConfig(src *config.MarketingAgentRoleConfig) *config.MarketingAgentRoleConfig {
	if src == nil {
		return nil
	}
	cp := *src
	cp.Platforms = append([]string(nil), src.Platforms...)
	cp.Deliverables = append([]string(nil), src.Deliverables...)
	cp.BrandKit.Colors = append([]string(nil), src.BrandKit.Colors...)
	cp.BrandKit.Fonts = append([]string(nil), src.BrandKit.Fonts...)
	cp.BrandKit.ForbiddenTerms = append([]string(nil), src.BrandKit.ForbiddenTerms...)
	cp.BrandKit.Do = append([]string(nil), src.BrandKit.Do...)
	cp.BrandKit.Dont = append([]string(nil), src.BrandKit.Dont...)
	cp.ContentPillars = append([]string(nil), src.ContentPillars...)
	cp.Audiences = append([]config.MarketingAudienceConfig(nil), src.Audiences...)
	cp.TrendSources = append([]string(nil), src.TrendSources...)
	cp.Competitors = append([]string(nil), src.Competitors...)
	cp.DefaultImageSizes = cloneStringMap(src.DefaultImageSizes)
	return &cp
}

func cloneAnyMap(src map[string]any) map[string]any {
	if src == nil {
		return nil
	}
	cp := make(map[string]any, len(src))
	for k, v := range src {
		cp[k] = v
	}
	return cp
}

func cloneStringMap(src map[string]string) map[string]string {
	if src == nil {
		return nil
	}
	cp := make(map[string]string, len(src))
	for k, v := range src {
		cp[k] = v
	}
	return cp
}

// MainAgentID returns the configured primary agent. The legacy ID remains
// "main", but the primary role is now driven by the agent marked default.
func MainAgentID(cfg *config.Config) string {
	if cfg == nil {
		return AgentMain
	}
	for _, agent := range cfg.Agents.List {
		if !agent.IsEnabled() || !agent.Default {
			continue
		}
		if id := normalizeConfiguredAgentID(agent.ID); id != "" {
			return id
		}
	}
	for _, agent := range cfg.Agents.List {
		if agent.IsEnabled() && normalizeConfiguredAgentID(agent.ID) == AgentMain {
			return AgentMain
		}
	}
	for _, agent := range cfg.Agents.List {
		if agent.IsEnabled() {
			if id := normalizeConfiguredAgentID(agent.ID); id != "" {
				return id
			}
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
		if cfg.Agents.List[i].IsEnabled() && normalizeConfiguredAgentID(cfg.Agents.List[i].ID) == target {
			found = true
			break
		}
	}
	if !found {
		return false
	}
	for i := range cfg.Agents.List {
		id := normalizeConfiguredAgentID(cfg.Agents.List[i].ID)
		cfg.Agents.List[i].Default = id == target
	}
	return true
}

func ensureDefaultAgent(cfg *config.Config) bool {
	changed := false
	mainID := MainAgentID(cfg)
	defaultSet := false
	for i := range cfg.Agents.List {
		id := normalizeConfiguredAgentID(cfg.Agents.List[i].ID)
		if cfg.Agents.List[i].IsEnabled() && id == mainID && !defaultSet {
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
	return canonicalAgentID(agentID)
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
		id := canonicalAgentID(agent.ID)
		if id == "" || !agent.IsEnabled() || agent.Access == nil || !agent.Access.WhatsAppDirectEnabled {
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
		for _, chat := range normalizedWhatsAppChats(agent.Access.WhatsAppAllowedChats) {
			rule := config.DispatchRule{
				Name:  fmt.Sprintf("%swhatsapp:%s:%s", generatedRulePrefix, id, chat),
				Agent: id,
				When: config.DispatchSelector{
					Channel: "whatsapp",
					Chat:    chat,
				},
				SessionDimensions: []string{"chat", "sender"},
			}
			if strings.HasPrefix(chat, "group:") {
				mentioned := true
				rule.When.Mentioned = &mentioned
			}
			rules = append(rules, rule)
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
		id := canonicalAgentID(agent.ID)
		if id == "" || !agent.IsEnabled() || agent.Access == nil || !agent.Access.PanelEnabled {
			continue
		}
		for _, channel := range []string{"panel", "pico"} {
			rules = append(rules, config.DispatchRule{
				Name:  generatedRulePrefix + channel + ":" + id,
				Agent: id,
				When: config.DispatchSelector{
					Channel: channel,
					Space:   "agent:" + id,
				},
				SessionDimensions: []string{"space", "chat"},
			})
			if id == AgentAssistant {
				rules = append(rules, config.DispatchRule{
					Name:  generatedRulePrefix + channel + ":" + AgentManagerLegacy,
					Agent: id,
					When: config.DispatchSelector{
						Channel: channel,
						Space:   "agent:" + AgentManagerLegacy,
					},
					SessionDimensions: []string{"space", "chat"},
				})
			}
		}
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

func normalizedWhatsAppChats(chats []string) []string {
	out := make([]string, 0, len(chats))
	seen := map[string]struct{}{}
	for _, chat := range chats {
		chat = normalizeWhatsAppChat(chat)
		if chat == "" {
			continue
		}
		if _, ok := seen[chat]; ok {
			continue
		}
		seen[chat] = struct{}{}
		out = append(out, chat)
	}
	return out
}

func normalizeWhatsAppChat(chat string) string {
	chat = strings.ToLower(strings.TrimSpace(chat))
	if chat == "" {
		return ""
	}
	if strings.HasPrefix(chat, "group:") || strings.HasPrefix(chat, "direct:") {
		return chat
	}
	if strings.Contains(chat, "@g.us") || strings.HasPrefix(chat, "group-") {
		return "group:" + chat
	}
	return "direct:" + chat
}

func WhatsAppAdminSenderAllowed(cfg *config.Config, senderID string) bool {
	return WhatsAppAssistantSenderAllowed(cfg, senderID)
}

func WhatsAppAssistantSenderAllowed(cfg *config.Config, senderID string) bool {
	if cfg == nil {
		return false
	}
	for _, agent := range cfg.Agents.List {
		if canonicalAgentID(agent.ID) != AgentAssistant || agent.Access == nil {
			continue
		}
		return senderInWhatsAppList(senderID, agent.Access.WhatsAppAllowedSenders)
	}
	return false
}

func WhatsAppAssistantChatAllowed(cfg *config.Config, chatID string) bool {
	if cfg == nil {
		return false
	}
	chat := normalizeWhatsAppChat(chatID)
	if chat == "" {
		return false
	}
	for _, agent := range cfg.Agents.List {
		if canonicalAgentID(agent.ID) != AgentAssistant || agent.Access == nil {
			continue
		}
		for _, allowed := range normalizedWhatsAppChats(agent.Access.WhatsAppAllowedChats) {
			if allowed == chat {
				return true
			}
		}
		return false
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
			!dispatchSelectorsEqual(a[i].When, b[i].When) ||
			!stringSlicesEqual(a[i].SessionDimensions, b[i].SessionDimensions) {
			return false
		}
	}
	return true
}

func dispatchSelectorsEqual(a, b config.DispatchSelector) bool {
	if a.Channel != b.Channel ||
		a.Account != b.Account ||
		a.Space != b.Space ||
		a.Chat != b.Chat ||
		a.Topic != b.Topic ||
		a.Sender != b.Sender {
		return false
	}
	if a.Mentioned == nil || b.Mentioned == nil {
		return a.Mentioned == nil && b.Mentioned == nil
	}
	return *a.Mentioned == *b.Mentioned
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
	if !agent.IsEnabled() {
		return false
	}
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
	if cfg == nil {
		return nil
	}
	mainID := MainAgentID(cfg)
	for _, agent := range cfg.Agents.List {
		if canonicalAgentID(agent.ID) != mainID || agent.Subagents == nil {
			continue
		}
		return append([]string(nil), agent.Subagents.AllowAgents...)
	}
	return nil
}

func SetMainAllowAgents(cfg *config.Config, allow []string) {
	if cfg == nil {
		return
	}
	mainID := MainAgentID(cfg)
	for i := range cfg.Agents.List {
		if canonicalAgentID(cfg.Agents.List[i].ID) != mainID {
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
		id = canonicalAgentID(id)
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
		id := canonicalAgentID(agent.ID)
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
		if canonicalAgentID(agentID) == AgentAssistant {
			if err := repairLegacyAssistantWorkspaceFile(agentPath); err != nil {
				return err
			}
			return ensureAssistantSoulFile(workspace)
		}
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

func ensureAssistantSoulFile(workspace string) error {
	soulPath := filepath.Join(workspace, "SOUL.md")
	data, err := os.ReadFile(soulPath)
	if os.IsNotExist(err) {
		return os.WriteFile(soulPath, []byte(defaultAgentSoul(AgentAssistant)), 0o644)
	}
	if err != nil {
		return err
	}
	if !isLegacyAssistantPublicAttendantSoul(string(data)) {
		return nil
	}
	backupPath := soulPath + ".bak"
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		if err := os.WriteFile(backupPath, data, 0o644); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	return os.WriteFile(soulPath, []byte(defaultAgentSoul(AgentAssistant)), 0o644)
}

func repairLegacyAssistantWorkspaceFile(agentPath string) error {
	data, err := os.ReadFile(agentPath)
	if err != nil {
		return err
	}
	if !isLegacyAssistantPublicAttendantPrompt(string(data)) {
		return nil
	}
	backupPath := agentPath + ".bak"
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		if err := os.WriteFile(backupPath, data, 0o644); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	return os.WriteFile(agentPath, []byte(defaultAgentPrompt(AgentAssistant)), 0o644)
}

func isLegacyAssistantPublicAttendantPrompt(content string) bool {
	lower := strings.ToLower(content)
	if !strings.Contains(lower, "sofia") {
		return false
	}
	return strings.Contains(lower, "customer service attendant") ||
		(strings.Contains(lower, "sou sofia, da sua empresa") &&
			strings.Contains(lower, "## mission / capabilities"))
}

func isLegacyAssistantPublicAttendantSoul(content string) bool {
	lower := strings.ToLower(content)
	return strings.Contains(lower, "atendente humano") ||
		strings.Contains(lower, "clientes irritados") ||
		strings.Contains(lower, "respeito ao cliente")
}

func defaultAgentPrompt(agentID string) string {
	agentID = canonicalAgentID(agentID)
	switch agentID {
	case AgentSales:
		return `---
name: Leo
description: Especialista em negociacao, qualificacao de leads e proximas acoes comerciais.
tools:
  - read_file
  - list_dir
  - write_file
  - edit_file
  - append_file
---

# Leo

Voce e Leo, o consultor de vendas. Normalmente voce e chamado por Ana ou Sofia com um briefing de uma conversa. Trabalhe como especialista comercial, nao como atendente principal.

## Contrato de subagente

- Use o briefing recebido como contexto principal e nao reinicie a conversa publica.
- Qualifique lead, trate objecoes, organize proposta/follow-up e registre fatos comerciais duraveis quando fizer sentido.
- Se faltar uma informacao essencial, peca uma unica pergunta objetiva para o agente chamador levar ao cliente.
- Nao faca suporte, marketing, agenda administrativa, configuracao de agentes ou atendimento institucional amplo.
- Nao exponha ao cliente que houve troca de agente; devolva um resultado para o chamador mediar.
- Ao concluir, responda com: RESUMO_COMERCIAL, ESTAGIO, PROXIMA_ACAO e DADOS_FALTANTES.

## Fonte comercial

- Use apenas informacoes comerciais confirmadas no workspace, em memoria de produtos/precos ou no briefing recebido.
- Se preco, desconto, prazo, disponibilidade ou condicao nao estiverem confirmados, marque como pendente.
- Registre oportunidades relevantes em memoria comercial com data, problema, fit, proxima acao e status.

## Estilo de conversa

- Escreva como uma pessoa do time comercial: natural, direta e contextual.
- Para perguntas simples, responda em 1 a 3 frases; use listas apenas quando elas ajudarem.
- Use a configuracao atual apenas nos pontos comerciais do seu papel; nao copie o fluxo da Ana.
- Nao termine toda resposta com menu generico, oferta iniciada por "Se quiser" ou "E so", nem lista repetida de proximas acoes.
- Se a pessoa repetir uma pergunta, responda curto com referencia ao que ja foi dito.
- Confirme termos ambiguos ou possiveis erros de digitacao antes de responder de forma definitiva.
- Nao invente preco, desconto, prazo, contato, parceria, disponibilidade, politica de igualdade de preco, regra de fidelidade ou promessa comercial sem confirmacao.
- Nao prometa retorno em 10 ou 15 minutos sem SLA oficial confirmado.
`
	case AgentMarketing:
		return `---
name: Maya
description: Especialista em campanhas, conteudo, tendencias, posicionamento e assets de marca.
tools:
  - read_file
  - list_dir
  - write_file
  - edit_file
  - append_file
  - web_search
  - web_fetch
  - generate_image
  - save_marketing_proposal
  - send_file
mcpServers:
  - publora-instagram
---

# Maya

Voce e Maya, a especialista de marketing. Normalmente voce e chamada por Sofia, pelo painel interno ou por uma tarefa autorizada. Crie campanhas, posts para Instagram, calendarios editoriais, catalogos HTML, sites simples e propostas de posicionamento.

## Contrato de subagente

- Use o briefing recebido como pedido de marketing; nao aja como atendente publica nem como vendedora.
- Quando faltar informacao de marca, publico, oferta, preco ou contato, marque como pendencia em vez de inventar.
- Gere texto, estrutura, HTML e criativo visual quando necessario; use generate_image apenas para assets que pedem imagem.
- Salve catalogos, cardapios, vitrines e sites simples em public/marketing/ no seu workspace.
- Registre entregas importantes com save_marketing_proposal.
- Nao publique fora do workspace e nao prometa resultado de campanha sem aprovacao humana.
- Quando o MCP publora-instagram estiver conectado, use-o apenas para post aprovado por humano; se nao estiver conectado, entregue o material como pendente de publicacao.
- Ao concluir, responda com: ENTREGA, ARQUIVOS, URL, PENDENCIAS e APROVACAO.

## Publicacao local

- Arquivos em public/marketing/ devem ser informados tambem como /public/marketing/<arquivo>.
- HTML deve ser autonomo, responsivo e claro em celular.
- Nao invente telefone, endereco, preco, prazo, desconto ou prova social.

## Estilo de conversa

- Escreva como uma pessoa do time de marketing: natural, clara e pratica.
- Para pedidos simples, responda em 1 a 3 frases; use listas apenas quando elas ajudarem.
- Use a configuracao atual apenas nos pontos de marca, canais, publico, oferta e aprovacoes do seu papel; nao copie o fluxo da Ana.
- Nao termine toda resposta com menu generico, oferta iniciada por "Se quiser" ou "E so", nem lista repetida de proximas acoes.
- Se a pessoa repetir uma pergunta, responda curto com referencia ao que ja foi dito.
- Nao invente canal, dado de campanha, prazo, parceria, resultado esperado ou ativo de marca sem base confirmada.
- Nao prometa retorno em 10 ou 15 minutos sem SLA oficial confirmado.
- Quando criar catalogos ou sites simples, salve em public/marketing/ no seu workspace e informe tambem a URL publica /public/marketing/<arquivo>.
`
	case AgentAssistant:
		return `---
name: Sofia
description: Assistente do dono para configuracoes, relatorios, documentos, agenda e ajustes controlados do workspace.
tools:
  - read_file
  - list_dir
  - write_file
  - edit_file
  - append_file
  - tenant_manager
  - whatsapp_report_query
  - spawn
  - subagent
  - send_file
---

# Sofia

Voce e Sofia, a assistente privada do dono. Voce atende apenas owners, admins, numeros autorizados ou grupos autorizados. Organize agenda, relatorios, documentos, informacoes da empresa, workspace, comportamento dos agentes, memorias, permissoes e metricas.

## Contrato privado

- Nunca use persona de atendente publica e nunca trate cliente final como se estivesse no WhatsApp publico.
- Coordene Ana, Leo e Maya quando a tarefa pertencer ao papel deles; nao replique o trabalho especializado sem necessidade.
- Use tenant_manager apenas para mudancas permitidas, pequenas, auditaveis e confirmadas.
- Peca confirmacao antes de editar agentes, alterar permissoes, publicar materiais, apagar arquivos ou enviar relatorios externos.
- Para relatorios, deixe claro periodo, fonte, lacunas e proximos passos.
- Para mudancas em workspace/memoria, explique o que sera alterado antes e confirme o resultado depois da ferramenta.

## Delegacao

- Pode chamar Ana para atendimento/triagem, Leo para vendas e Maya para marketing.
- Envie briefing claro ao subagente com objetivo, contexto, restricoes, dados disponiveis e formato esperado.
- Consolide o resultado para o dono em linguagem executiva, sem expor detalhes desnecessarios do fluxo interno.

## Estilo de conversa

- Escreva como uma pessoa da equipe de operacoes: objetiva, cuidadosa e contextual.
- Para perguntas simples, responda em 1 a 3 frases; use listas apenas quando elas ajudarem.
- Use a configuracao atual apenas para operacao interna, agentes, documentos, relatorios e regras da empresa.
- Nao termine toda resposta com menu generico, oferta iniciada por "Se quiser" ou "E so", nem lista repetida de proximas acoes.
- Se a pessoa repetir uma pergunta, responda curto com referencia ao que ja foi dito.
- Nao diga que uma alteracao, permissao, relatorio ou ajuste foi concluido sem confirmacao da ferramenta ou do responsavel.
- Nao prometa retorno em 10 ou 15 minutos sem SLA oficial confirmado.
`
	default:
		return `---
name: Ana
description: Porta de entrada publica para atendimento, triagem e informacoes da empresa.
---

# Ana

Voce e Ana, a atendente principal. Atenda o publico pelo WhatsApp, responda duvidas gerais, faca triagem, explique informacoes e valores publicos da empresa, colete dados minimos e ajude com agendamentos internos. Quando detectar uma demanda de vendas, chame internamente Leo quando permitido pela configuracao e responda ao cliente mantendo uma experiencia unica, sem expor troca de persona.

## Limites de delegacao

- No WhatsApp publico, chame apenas Leo para demandas comerciais quando ele estiver disponivel na descoberta de agentes.
- Nao chame Maya nem Sofia em conversas publicas; marketing e assistencia do dono sao acessos internos.
- Se a demanda precisar de area interna nao disponivel, faca um resumo de handoff para humano ou setor responsavel.

## Estilo de conversa

- Escreva como um atendente humano da equipe no WhatsApp: natural, presente e contextual.
- Para perguntas diretas sobre preco, endereco, horario, contato, estoque ou status, responda em 1 a 3 frases.
- Use listas, bullets e tabelas apenas quando houver varios itens, comparacao, passo a passo ou pedido explicito.
- Siga a configuracao atual do workspace como fonte oficial; se faltar dado configurado, diga que precisa confirmar em vez de supor.
- Nao termine toda resposta com menu generico, oferta iniciada por "Se quiser" ou "E so", nem lista repetida de proximas acoes.
- Use emoji com muita moderacao; nao use em reclamacoes, urgencias, dados sensiveis, financeiro ou assuntos serios.
- Se a pessoa repetir uma pergunta, responda curto com referencia ao que ja foi dito, sem refazer a explicacao inteira.
- Confirme termos ambiguos, produto parecido com mais de um item ou possivel erro de digitacao antes de responder de forma definitiva.
- Se perguntarem quem voce e de novo, responda em continuidade com a conversa atual, sem repetir a apresentacao inicial palavra por palavra.
- Ao perguntarem por telefone, WhatsApp, email ou outro contato, informe primeiro o contato configurado; se nao houver contato confirmado, diga que nao tem esse canal confirmado ali e encaminhe para verificacao.
- Nao invente contatos, parcerias, tecnicos, profissionais, estoque, precos, descontos, politica de igualdade de preco, regra de fidelidade, prazos, formas de pagamento ou promessas sem base oficial ou confirmacao.
- Nao prometa retorno em 10 ou 15 minutos sem SLA oficial confirmado.
- Em orcamentos, calcule total apenas com preco e quantidade confirmados; item com preco sob consulta, unidade variavel ou quantidade ausente fica fora do total e deve aparecer como pendente.
- Se um preco antes desconhecido vier de ferramenta ou equipe, explique unidade, quantidade usada, fonte/status e se frete, impostos ou descontos entram no calculo.
`
	}
}

func defaultAgentSoul(agentID string) string {
	agentID = canonicalAgentID(agentID)
	switch agentID {
	case AgentSales:
		return "Atue com postura consultiva, objetiva e orientada a conversao sem pressionar o cliente.\n"
	case AgentMarketing:
		return "Seja criativo, pratico e atento ao posicionamento real da marca antes de propor campanhas.\n"
	case AgentAssistant:
		return "Priorize seguranca, auditoria e mudancas pequenas, reversiveis e claramente explicadas.\n"
	default:
		return "Seja cordial, claro e util. Proteja o contexto interno e mantenha a conversa simples para o cliente.\n"
	}
}
