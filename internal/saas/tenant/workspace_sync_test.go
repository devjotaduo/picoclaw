package tenant

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeSyncTestFile(t *testing.T, root, rel, content string) {
	t.Helper()
	path := filepath.Join(root, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", rel, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", rel, err)
	}
}

func TestSyncWorkspaceRuntimePreservesTenantStateAndCopiesSkills(t *testing.T) {
	ws := t.TempDir()
	srcWorkspace := filepath.Join(ws, WorkspaceHomeSubdir, "workspace")
	writeSyncTestFile(t, srcWorkspace, "skills/onboarding-state/scripts/state.py", "new state")
	writeSyncTestFile(t, srcWorkspace, "agents/catarina/AGENT.md", "new catarina")
	writeSyncTestFile(t, srcWorkspace, "memory/empresa.md", "template should not copy")
	writeSyncTestFile(t, srcWorkspace, "state/onboarding.json", `{"phase":"template"}`)
	writeSyncTestFile(t, filepath.Join(ws, WorkspaceHomeSubdir), "config.json", `{"template":true}`)

	vol := t.TempDir()
	writeSyncTestFile(t, vol, "workspace/skills/onboarding-state/scripts/state.py", "old state")
	writeSyncTestFile(t, vol, "workspace/memory/empresa.md", "real company memory")
	writeSyncTestFile(t, vol, "workspace/state/onboarding.json", `{"phase":"discovery_done"}`)
	writeSyncTestFile(t, vol, "config.json", `{"tenant":true}`)

	result, err := SyncWorkspaceRuntime(ws, vol, false)
	if err != nil {
		t.Fatalf("SyncWorkspaceRuntime: %v", err)
	}
	if result.FilesCopied != 2 {
		t.Fatalf("FilesCopied = %d, want 2", result.FilesCopied)
	}

	gotState, _ := os.ReadFile(filepath.Join(vol, "workspace/skills/onboarding-state/scripts/state.py"))
	if string(gotState) != "new state" {
		t.Fatalf("state.py = %q, want new state", gotState)
	}
	gotMemory, _ := os.ReadFile(filepath.Join(vol, "workspace/memory/empresa.md"))
	if string(gotMemory) != "real company memory" {
		t.Fatalf("memory/empresa.md was overwritten: %q", gotMemory)
	}
	gotOnboarding, _ := os.ReadFile(filepath.Join(vol, "workspace/state/onboarding.json"))
	if string(gotOnboarding) != `{"phase":"discovery_done"}` {
		t.Fatalf("state/onboarding.json was overwritten: %q", gotOnboarding)
	}
	gotConfig, _ := os.ReadFile(filepath.Join(vol, "config.json"))
	if string(gotConfig) != `{"tenant":true}` {
		t.Fatalf("config.json was overwritten: %q", gotConfig)
	}
}

func TestSyncWorkspaceRuntimePublicUpdatesClienteBackupAndSofiaOverride(t *testing.T) {
	ws := t.TempDir()
	srcWorkspace := filepath.Join(ws, WorkspaceHomeSubdir, "workspace")
	writeSyncTestFile(t, srcWorkspace, "AGENT.md", "# canonical cliente v2\n")
	writeSyncTestFile(t, srcWorkspace, "skills/onboarding-state/SKILL.md", "skill v2")

	vol := t.TempDir()
	writeSyncTestFile(t, vol, "workspace/AGENT.md", "# old Sofia override\n")
	writeSyncTestFile(t, vol, "workspace/"+publicAgentBackupName, "# canonical cliente v1\n")

	result, err := SyncWorkspaceRuntime(ws, vol, true)
	if err != nil {
		t.Fatalf("SyncWorkspaceRuntime public: %v", err)
	}
	if !result.PublicAgentApplied {
		t.Fatal("PublicAgentApplied = false, want true")
	}

	backup, _ := os.ReadFile(filepath.Join(vol, "workspace", publicAgentBackupName))
	if string(backup) != "# canonical cliente v2\n" {
		t.Fatalf("public cliente backup not refreshed: %q", backup)
	}
	agent, _ := os.ReadFile(filepath.Join(vol, "workspace/AGENT.md"))
	if !strings.Contains(string(agent), "Você é a **Sofia**") {
		t.Fatalf("public AGENT.md should stay Sofia mode, got %q", agent)
	}
	skill, _ := os.ReadFile(filepath.Join(vol, "workspace/skills/onboarding-state/SKILL.md"))
	if string(skill) != "skill v2" {
		t.Fatalf("skill not synced: %q", skill)
	}
}

func TestBackfillEmpresaMemoryFromOnboardingStateWritesValidatorFields(t *testing.T) {
	vol := t.TempDir()
	writeSyncTestFile(t, vol, "workspace/AGENT.md", "# workspace")
	writeSyncTestFile(t, vol, "workspace/memory/empresa.md", "# Empresa\n\nStatus: pendente de validação\n")
	writeSyncTestFile(t, vol, "workspace/state/onboarding.json", `{
  "phase": "discovery_done",
  "discovery": {
    "completed_at": "2026-06-01T04:35:57Z",
    "segment": "clinica",
    "summary": "Studio Viva Teste3: estúdio de pilates e fisioterapia."
  },
  "owner_captured": {
    "name": "Carla Teste3",
    "email": "carla.teste3@jotaduo.com",
    "whatsapp": "87988553793"
  },
  "deepening": {
    "areas_covered": [],
    "areas_required": ["equipe", "faq"]
  },
  "promotion": {
    "ready": false,
    "blocked_by": ["empresa_memory_empty: memory/empresa.md has only 0 filled field(s) (min 3)"],
    "promoted_at": null,
    "promoted_by": null
  }
}`)

	result, err := BackfillEmpresaMemoryFromOnboardingState(vol)
	if err != nil {
		t.Fatalf("BackfillEmpresaMemoryFromOnboardingState: %v", err)
	}
	if !result.Written || !result.StateUpdated {
		t.Fatalf("result = %#v, want written + state updated", result)
	}

	empresa, _ := os.ReadFile(filepath.Join(vol, "workspace/memory/empresa.md"))
	for _, want := range []string{
		"Nome: Studio Viva Teste3",
		"Segmento: saude",
		"Email: carla.teste3@jotaduo.com",
		"WhatsApp: 87988553793",
		"Canal de agendamento:",
		"Convênios aceitos:",
	} {
		if !strings.Contains(string(empresa), want) {
			t.Fatalf("empresa.md missing %q:\n%s", want, empresa)
		}
	}
	if strings.Contains(string(empresa), "Status: pendente de validação") {
		t.Fatalf("empresa.md kept pending marker:\n%s", empresa)
	}

	state, _ := os.ReadFile(filepath.Join(vol, "workspace/state/onboarding.json"))
	if strings.Contains(string(state), "empresa_memory_empty") {
		t.Fatalf("onboarding.json still has empresa_memory_empty:\n%s", state)
	}
	if !strings.Contains(string(state), "deepening_incomplete: equipe,faq") {
		t.Fatalf("onboarding.json should keep real deepening blocker:\n%s", state)
	}
}
