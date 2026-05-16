package orchestrator

import (
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

func TestPanelAllowedBlocksOperatorAndViewerForSensitiveAgents(t *testing.T) {
	cfg := config.DefaultConfig()
	EnsureSpecialistConfig(cfg)
	for _, agentID := range []string{AgentMarketing, AgentManager} {
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
		if cfg.Agents.List[i].ID == AgentMain {
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
		if cfg.Agents.List[i].ID == AgentMarketing {
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
	if route.AgentID != AgentMarketing {
		t.Fatalf("authorized sender route = %q, want marketing", route.AgentID)
	}
}

func findAgent(cfg *config.Config, agentID string) (config.AgentConfig, bool) {
	for _, agent := range cfg.Agents.List {
		if agent.ID == agentID {
			return agent, true
		}
	}
	return config.AgentConfig{}, false
}
