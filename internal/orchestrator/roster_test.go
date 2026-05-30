package orchestrator

import (
	"testing"

	"github.com/sipeed/picoclaw/pkg/config"
)

func rosterTestConfig(roster []string) *config.Config {
	cfg := config.DefaultConfig()
	cfg.Agents.List = nil
	cfg.Agents.Dispatch = nil
	cfg.Agents.SkipSpecialistSeed = false
	cfg.Agents.Roster = roster
	return cfg
}

func TestEnsureSpecialistConfigRosterTwoAgents(t *testing.T) {
	cfg := rosterTestConfig([]string{"attendant", "assistant"})
	if !EnsureSpecialistConfig(cfg) {
		t.Fatal("expected roster seed to report a change on first run")
	}
	ids := map[string]bool{}
	for _, a := range cfg.Agents.List {
		ids[canonicalAgentID(a.ID)] = true
	}
	if !ids[AgentMain] || !ids[AgentAssistant] {
		t.Errorf("expected main+assistente, got %v", ids)
	}
	if ids[AgentSales] || ids[AgentMarketing] {
		t.Errorf("roster must NOT materialize vendas/marketing, got %v", ids)
	}
	// Assistant may only call agents that exist in the roster.
	assistant, ok := findAgent(cfg, AgentAssistant)
	if !ok {
		t.Fatal("assistant agent missing")
	}
	if assistant.Subagents == nil {
		t.Fatal("assistant missing subagents")
	}
	for _, sub := range assistant.Subagents.AllowAgents {
		if canonicalAgentID(sub) != AgentMain {
			t.Errorf("assistant subagent %q references non-roster agent", sub)
		}
	}
}

func TestEnsureSpecialistConfigRosterIdempotent(t *testing.T) {
	cfg := rosterTestConfig([]string{"attendant", "assistant"})
	EnsureSpecialistConfig(cfg)
	if EnsureSpecialistConfig(cfg) {
		t.Error("expected second roster seed run to be a no-op (stable across reboots)")
	}
}

func TestEnsureSpecialistConfigRosterForcesMain(t *testing.T) {
	// Roster omits the attendant; main must still be materialized as default.
	cfg := rosterTestConfig([]string{"assistant"})
	EnsureSpecialistConfig(cfg)
	mainDefault := false
	for _, a := range cfg.Agents.List {
		if canonicalAgentID(a.ID) == AgentMain && a.Default {
			mainDefault = true
		}
	}
	if !mainDefault {
		t.Error("expected main to exist and be the default agent even when omitted from roster")
	}
}
