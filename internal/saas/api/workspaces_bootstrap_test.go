package api

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractEmbeddedBaselineRoutesCanonicalWorkspaceUnderHomeWorkspace(t *testing.T) {
	homeDir := t.TempDir()

	if err := extractEmbeddedBaseline(homeDir); err != nil {
		t.Fatalf("extractEmbeddedBaseline: %v", err)
	}

	mustExist := []string{
		"ui-visibility.json",
		"workspace/AGENT.md",
		"workspace/SOUL.md",
		"workspace/agents/sofia/AGENT.md",
		"workspace/skills/onboarding-state/SKILL.md",
		"workspace/cron/jobs.json",
	}
	for _, rel := range mustExist {
		if _, err := os.Stat(filepath.Join(homeDir, filepath.FromSlash(rel))); err != nil {
			t.Fatalf("expected %s to be extracted: %v", rel, err)
		}
	}

	if _, err := os.Stat(filepath.Join(homeDir, "AGENT.md")); !os.IsNotExist(err) {
		t.Fatalf("embedded workspace content must not be extracted flat at home/AGENT.md")
	}
	if _, err := os.Stat(filepath.Join(homeDir, "workspace", "config.json")); !os.IsNotExist(err) {
		t.Fatalf("runtime config must stay at home/config.json, not home/workspace/config.json")
	}
}

func TestSeedDefaultWorkspaceHomePreservesLegacyFlatOperatorEdits(t *testing.T) {
	homeDir := t.TempDir()
	customAgent := "# Operador customizado\n"
	customSofia := "# Sofia customizada\n"
	if err := os.WriteFile(filepath.Join(homeDir, "AGENT.md"), []byte(customAgent), 0o644); err != nil {
		t.Fatal(err)
	}
	sofiaPath := filepath.Join(homeDir, "agents", "sofia", "AGENT.md")
	if err := os.MkdirAll(filepath.Dir(sofiaPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sofiaPath, []byte(customSofia), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := seedDefaultWorkspaceHome(homeDir); err != nil {
		t.Fatalf("seedDefaultWorkspaceHome: %v", err)
	}

	gotAgent, err := os.ReadFile(filepath.Join(homeDir, "workspace", "AGENT.md"))
	if err != nil {
		t.Fatalf("read repaired workspace/AGENT.md: %v", err)
	}
	if string(gotAgent) != customAgent {
		t.Fatalf("workspace/AGENT.md = %q, want legacy flat edit %q", gotAgent, customAgent)
	}

	gotSofia, err := os.ReadFile(filepath.Join(homeDir, "workspace", "agents", "sofia", "AGENT.md"))
	if err != nil {
		t.Fatalf("read repaired Sofia prompt: %v", err)
	}
	if string(gotSofia) != customSofia {
		t.Fatalf("workspace/agents/sofia/AGENT.md = %q, want legacy flat edit %q", gotSofia, customSofia)
	}

	if _, err := os.Stat(filepath.Join(homeDir, "ui-visibility.json")); err != nil {
		t.Fatalf("embedded root ui-visibility.json was not filled: %v", err)
	}
	if _, err := os.Stat(filepath.Join(homeDir, "workspace", "ui-visibility.json")); !os.IsNotExist(err) {
		t.Fatalf("ui-visibility.json must stay at home/ui-visibility.json, not home/workspace/ui-visibility.json")
	}
}

func TestSeedDefaultWorkspaceHomeDoesNotCopyWorkspaceIntoItself(t *testing.T) {
	homeDir := t.TempDir()
	workspaceAgent := filepath.Join(homeDir, "workspace", "AGENT.md")
	if err := os.MkdirAll(filepath.Dir(workspaceAgent), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(workspaceAgent, []byte("# Canonical workspace\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := seedDefaultWorkspaceHome(homeDir); err != nil {
		t.Fatalf("seedDefaultWorkspaceHome: %v", err)
	}

	if _, err := os.Stat(filepath.Join(homeDir, "workspace", "workspace")); !os.IsNotExist(err) {
		t.Fatalf("seedDefaultWorkspaceHome must not create workspace/workspace, stat err=%v", err)
	}
}
