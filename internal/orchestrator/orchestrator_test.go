package orchestrator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	saasPolicy "github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/routing"
)

func TestEnsureSpecialistConfigDefaults(t *testing.T) {
	cfg := config.DefaultConfig()
	if !EnsureSpecialistConfig(cfg) {
		t.Fatal("expected defaults to be added")
	}

	if got := MainAllowAgents(cfg); len(got) != 1 || got[0] != AgentSales {
		t.Fatalf("main allow agents = %#v, want [vendas]", got)
	}
	assistant, ok := findAgent(cfg, AgentAssistant)
	if !ok {
		t.Fatal("expected assistente agent")
	}
	if assistant.Name != "Sofia" {
		t.Fatalf("assistant name = %q, want Sofia", assistant.Name)
	}
	if assistant.Avatar == nil || assistant.Avatar.Initials != "SO" {
		t.Fatalf("assistant avatar = %#v, want SO preset", assistant.Avatar)
	}
	if assistant.Subagents == nil || !stringSlicesEqual(assistant.Subagents.AllowAgents, []string{AgentMain, AgentSales, AgentMarketing}) {
		t.Fatalf("assistant allow agents = %#v", assistant.Subagents)
	}

	resolver := routing.NewRouteResolver(cfg)
	route := resolver.ResolveRoute(bus.InboundContext{
		Channel:  "whatsapp",
		ChatID:   "5511999999999@s.whatsapp.net",
		ChatType: "direct",
		SenderID: "5511999999999@s.whatsapp.net",
	})
	if route.AgentID != AgentMain {
		t.Fatalf("public whatsapp route = %q, want main", route.AgentID)
	}
}

func TestDefaultAgentPromptsUseNaturalConversationRules(t *testing.T) {
	for _, agentID := range []string{AgentMain, AgentSales, AgentMarketing, AgentAssistant} {
		prompt := defaultAgentPrompt(agentID)
		for _, want := range []string{
			"## Estilo de conversa",
			"Nao termine toda resposta com menu generico",
			"Se a pessoa repetir uma pergunta",
			"Nao prometa retorno em 10 ou 15 minutos",
		} {
			if !strings.Contains(prompt, want) {
				t.Fatalf("defaultAgentPrompt(%s) missing %q:\n%s", agentID, want, prompt)
			}
		}
	}

	mainPrompt := defaultAgentPrompt(AgentMain)
	for _, want := range []string{
		"atendente humano da equipe",
		"No WhatsApp publico, chame apenas Leo",
		"Nao chame Maya nem Sofia",
		"1 a 3 frases",
		"Nao invente contatos, parcerias, tecnicos",
		"Siga a configuracao atual do workspace como fonte oficial",
		"Confirme termos ambiguos",
		"preco sob consulta",
		"explique unidade, quantidade usada, fonte/status",
	} {
		if !strings.Contains(mainPrompt, want) {
			t.Fatalf("main prompt missing %q:\n%s", want, mainPrompt)
		}
	}

	salesPrompt := defaultAgentPrompt(AgentSales)
	for _, want := range []string{"tools:", "RESUMO_COMERCIAL", "ESTAGIO", "PROXIMA_ACAO", "DADOS_FALTANTES", "nao como atendente principal"} {
		if !strings.Contains(salesPrompt, want) {
			t.Fatalf("sales prompt missing %q:\n%s", want, salesPrompt)
		}
	}

	marketingPrompt := defaultAgentPrompt(AgentMarketing)
	for _, want := range []string{"generate_image", "save_marketing_proposal", "publora-instagram", "ENTREGA", "ARQUIVOS", "URL", "public/marketing"} {
		if !strings.Contains(marketingPrompt, want) {
			t.Fatalf("marketing prompt missing %q:\n%s", want, marketingPrompt)
		}
	}

	assistantPrompt := defaultAgentPrompt(AgentAssistant)
	for _, want := range []string{"tenant_manager", "spawn", "subagent", "assistente privada", "Nunca use persona de atendente publica"} {
		if !strings.Contains(assistantPrompt, want) {
			t.Fatalf("assistant prompt missing %q:\n%s", want, assistantPrompt)
		}
	}
}

func TestEnsureWorkspaceFilesRepairsLegacyAssistantPrompt(t *testing.T) {
	workspace := t.TempDir()
	agentPath := filepath.Join(workspace, "AGENT.md")
	legacy := `---
name: sofia
---

You are Sofia, the customer service attendant for Sua Empresa.

## Mission / Capabilities

- Responder dúvidas frequentes sobre a empresa.
`
	if err := os.WriteFile(agentPath, []byte(legacy), 0o644); err != nil {
		t.Fatalf("write legacy AGENT.md: %v", err)
	}
	soulPath := filepath.Join(workspace, "SOUL.md")
	legacySoul := "Responde como atendente humano da equipe, com clientes irritados.\n"
	if err := os.WriteFile(soulPath, []byte(legacySoul), 0o644); err != nil {
		t.Fatalf("write legacy SOUL.md: %v", err)
	}
	cfg := &config.Config{Agents: config.AgentsConfig{List: []config.AgentConfig{{
		ID:        AgentAssistant,
		Workspace: workspace,
	}}}}

	if err := EnsureWorkspaceFiles(cfg); err != nil {
		t.Fatalf("EnsureWorkspaceFiles() error = %v", err)
	}
	gotBytes, err := os.ReadFile(agentPath)
	if err != nil {
		t.Fatalf("read repaired AGENT.md: %v", err)
	}
	got := string(gotBytes)
	if strings.Contains(got, "customer service attendant") || strings.Contains(got, "Sua Empresa") {
		t.Fatalf("legacy assistant prompt was not repaired:\n%s", got)
	}
	if !strings.Contains(got, "assistente privada do dono") || !strings.Contains(got, "tenant_manager") {
		t.Fatalf("repaired assistant prompt missing Sofia contract:\n%s", got)
	}
	if backupBytes, err := os.ReadFile(agentPath + ".bak"); err != nil || string(backupBytes) != legacy {
		t.Fatalf("backup mismatch err=%v content=%q", err, string(backupBytes))
	}
	soulBytes, err := os.ReadFile(soulPath)
	if err != nil {
		t.Fatalf("read repaired SOUL.md: %v", err)
	}
	if strings.Contains(string(soulBytes), "atendente humano") || !strings.Contains(string(soulBytes), "seguranca") {
		t.Fatalf("legacy assistant soul was not repaired:\n%s", string(soulBytes))
	}
	if backupBytes, err := os.ReadFile(soulPath + ".bak"); err != nil || string(backupBytes) != legacySoul {
		t.Fatalf("soul backup mismatch err=%v content=%q", err, string(backupBytes))
	}
}

func TestSelectedMainAgentDrivesFallbackRoutingAndSettings(t *testing.T) {
	cfg := config.DefaultConfig()
	EnsureSpecialistConfig(cfg)

	if !SetMainAgent(cfg, AgentMarketing) {
		t.Fatal("expected marketing to be selectable as main agent")
	}
	SetMainAllowAgents(cfg, []string{AgentAssistant})
	for i := range cfg.Agents.List {
		if cfg.Agents.List[i].ID == AgentAssistant {
			if cfg.Agents.List[i].Access == nil {
				cfg.Agents.List[i].Access = &config.AgentAccessConfig{}
			}
			cfg.Agents.List[i].Access.WhatsAppAllowedSenders = []string{"whatsapp:55118888@s.whatsapp.net"}
		}
	}

	EnsureSpecialistConfig(cfg)

	if got := MainAgentID(cfg); got != AgentMarketing {
		t.Fatalf("main agent = %q, want %q", got, AgentMarketing)
	}
	if got := MainAllowAgents(cfg); len(got) != 1 || got[0] != AgentAssistant {
		t.Fatalf("main allow agents = %#v, want [assistente]", got)
	}
	if !WhatsAppAdminSenderAllowed(cfg, "55118888@s.whatsapp.net") {
		t.Fatal("expected configured sender to be allowed for selected main")
	}

	route := routing.NewRouteResolver(cfg).ResolveRoute(bus.InboundContext{
		Channel:  "whatsapp",
		ChatID:   "5511999999999@s.whatsapp.net",
		ChatType: "direct",
		SenderID: "5511999999999@s.whatsapp.net",
	})
	if route.AgentID != AgentMarketing {
		t.Fatalf("public whatsapp route = %q, want marketing", route.AgentID)
	}

	route = routing.NewRouteResolver(cfg).ResolveRoute(bus.InboundContext{
		Channel:   "pico",
		ChatID:    "pico:browser-session",
		ChatType:  "direct",
		SpaceID:   AgentAssistant,
		SpaceType: "agent",
		SenderID:  "pico-user",
	})
	if route.AgentID != AgentAssistant {
		t.Fatalf("pico selected agent route = %q, want assistente", route.AgentID)
	}

	route = routing.NewRouteResolver(cfg).ResolveRoute(bus.InboundContext{
		Channel:   "pico",
		ChatID:    "pico:browser-session",
		ChatType:  "direct",
		SpaceID:   AgentManagerLegacy,
		SpaceType: "agent",
		SenderID:  "pico-user",
	})
	if route.AgentID != AgentAssistant {
		t.Fatalf("legacy gerente route = %q, want assistente", route.AgentID)
	}
}

func TestPanelAllowedBlocksOperatorAndViewerForSensitiveAgents(t *testing.T) {
	cfg := config.DefaultConfig()
	EnsureSpecialistConfig(cfg)
	for _, agentID := range []string{AgentMarketing, AgentAssistant} {
		agent, ok := findAgent(cfg, agentID)
		if !ok {
			t.Fatalf("agent %s missing", agentID)
		}
		if PanelAllowed(agent, saasPolicy.RoleOperator) {
			t.Fatalf("operator should not access %s", agentID)
		}
		if PanelAllowed(agent, saasPolicy.RoleViewer) {
			t.Fatalf("viewer should not access %s", agentID)
		}
		if !PanelAllowed(agent, saasPolicy.RoleTenantOwner) {
			t.Fatalf("owner should access %s", agentID)
		}
	}
}

func TestWhatsAppAdminSenderAllowed(t *testing.T) {
	cfg := config.DefaultConfig()
	EnsureSpecialistConfig(cfg)
	for i := range cfg.Agents.List {
		if cfg.Agents.List[i].ID == AgentAssistant {
			cfg.Agents.List[i].Access.WhatsAppAllowedSenders = []string{"whatsapp:55118888@s.whatsapp.net"}
		}
	}
	if !WhatsAppAdminSenderAllowed(cfg, "55118888@s.whatsapp.net") {
		t.Fatal("expected configured WhatsApp sender to be allowed")
	}
	if WhatsAppAdminSenderAllowed(cfg, "55117777@s.whatsapp.net") {
		t.Fatal("unexpected sender should not be allowed")
	}
}

func TestNumberSpecificDirectRouting(t *testing.T) {
	cfg := config.DefaultConfig()
	EnsureSpecialistConfig(cfg)
	for i := range cfg.Agents.List {
		if cfg.Agents.List[i].ID == AgentAssistant {
			cfg.Agents.List[i].Access.WhatsAppDirectEnabled = true
			cfg.Agents.List[i].Access.WhatsAppAllowedSenders = []string{"55118888@s.whatsapp.net"}
		}
	}
	EnsureSpecialistConfig(cfg)
	route := routing.NewRouteResolver(cfg).ResolveRoute(bus.InboundContext{
		Channel:  "whatsapp",
		ChatID:   "55118888@s.whatsapp.net",
		ChatType: "direct",
		SenderID: "55118888@s.whatsapp.net",
	})
	if route.AgentID != AgentAssistant {
		t.Fatalf("authorized sender route = %q, want assistente", route.AgentID)
	}
}

func TestLegacyGerenteMigratesToAssistente(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Agents.List = []config.AgentConfig{
		{ID: AgentMain, Default: true},
		{
			ID:        AgentManagerLegacy,
			Name:      "Gerente",
			Workspace: "/tmp/workspace-gerente",
			Access: &config.AgentAccessConfig{
				PanelEnabled:           true,
				WhatsAppDirectEnabled:  true,
				WhatsAppAllowedSenders: []string{"55118888@s.whatsapp.net"},
			},
		},
	}

	EnsureSpecialistConfig(cfg)

	if _, ok := findAgent(cfg, AgentManagerLegacy); !ok {
		t.Fatal("legacy gerente alias should resolve to assistente")
	}
	assistant, ok := findAgent(cfg, AgentAssistant)
	if !ok {
		t.Fatal("expected migrated assistente")
	}
	if assistant.ID != AgentAssistant {
		t.Fatalf("assistant ID = %q, want assistente", assistant.ID)
	}
	if assistant.Workspace != "/tmp/workspace-gerente" {
		t.Fatalf("workspace = %q, want preserved legacy workspace", assistant.Workspace)
	}
	if assistant.Name != "Sofia" {
		t.Fatalf("name = %q, want Sofia", assistant.Name)
	}
}

func TestAssistantWhatsAppGroupRoutingRequiresMention(t *testing.T) {
	cfg := config.DefaultConfig()
	EnsureSpecialistConfig(cfg)
	for i := range cfg.Agents.List {
		if cfg.Agents.List[i].ID == AgentAssistant {
			cfg.Agents.List[i].Access.WhatsAppAllowedChats = []string{"120363000000000000@g.us"}
		}
	}
	EnsureSpecialistConfig(cfg)

	unmentioned := routing.NewRouteResolver(cfg).ResolveRoute(bus.InboundContext{
		Channel:  "whatsapp",
		ChatID:   "120363000000000000@g.us",
		ChatType: "group",
		SenderID: "55118888@s.whatsapp.net",
	})
	if unmentioned.AgentID == AgentAssistant {
		t.Fatal("unmentioned group message should not route to assistente")
	}

	mentioned := routing.NewRouteResolver(cfg).ResolveRoute(bus.InboundContext{
		Channel:   "whatsapp",
		ChatID:    "120363000000000000@g.us",
		ChatType:  "group",
		SenderID:  "55118888@s.whatsapp.net",
		Mentioned: true,
	})
	if mentioned.AgentID != AgentAssistant {
		t.Fatalf("mentioned group route = %q, want assistente", mentioned.AgentID)
	}
}

func findAgent(cfg *config.Config, agentID string) (config.AgentConfig, bool) {
	agentID = CanonicalAgentID(agentID)
	for _, agent := range cfg.Agents.List {
		if CanonicalAgentID(agent.ID) == agentID {
			return agent, true
		}
	}
	return config.AgentConfig{}, false
}
