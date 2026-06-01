package tenant

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// setupWorkspaceVolume creates a fake tenant volume with a workspace/AGENT.md
// containing the canonical team prompt, mirroring what CopyWorkspaceHome
// produces. Returns the volume path.
func setupWorkspaceVolume(t *testing.T, agentMDContent string) string {
	t.Helper()
	vol := t.TempDir()
	wsDir := filepath.Join(vol, "workspace")
	if err := os.MkdirAll(wsDir, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.WriteFile(filepath.Join(wsDir, "AGENT.md"), []byte(agentMDContent), 0o644); err != nil {
		t.Fatalf("write AGENT.md: %v", err)
	}
	return vol
}

func TestApplyPublicSofiaAgentMD_FirstTimeBackupsAndOverrides(t *testing.T) {
	const canonical = "# AGENT canonical\n\n- Rafael: assistente interno\n- Sofia: chamada por Rafael\n"
	vol := setupWorkspaceVolume(t, canonical)

	if err := ApplyPublicSofiaAgentMD(vol); err != nil {
		t.Fatalf("ApplyPublicSofiaAgentMD: %v", err)
	}

	// Canonical preserved as AGENT.cliente.md
	backupPath := filepath.Join(vol, "workspace", "AGENT.cliente.md")
	got, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("read backup: %v", err)
	}
	if string(got) != canonical {
		t.Errorf("backup content mismatch:\nwant: %q\ngot:  %q", canonical, got)
	}

	// AGENT.md replaced with Sofia mode
	newAgent, err := os.ReadFile(filepath.Join(vol, "workspace", "AGENT.md"))
	if err != nil {
		t.Fatalf("read new AGENT.md: %v", err)
	}
	if !strings.Contains(string(newAgent), "Você é a **Sofia**") {
		t.Error("new AGENT.md should declare Sofia persona")
	}
	if !strings.Contains(string(newAgent), "jotaduo-discovery") {
		t.Error("new AGENT.md should reference jotaduo-discovery skill")
	}
}

func TestApplyPublicSofiaAgentMD_IdempotentDoesNotReBackup(t *testing.T) {
	const canonical = "# AGENT original\n"
	vol := setupWorkspaceVolume(t, canonical)

	// First run backs up + overrides.
	if err := ApplyPublicSofiaAgentMD(vol); err != nil {
		t.Fatalf("first ApplyPublicSofiaAgentMD: %v", err)
	}

	// Second run should NOT re-back-up — AGENT.md is now the Sofia override,
	// not the canonical. If we re-backed up, AGENT.cliente.md would become
	// the Sofia content and promote would restore the wrong thing.
	if err := ApplyPublicSofiaAgentMD(vol); err != nil {
		t.Fatalf("second ApplyPublicSofiaAgentMD: %v", err)
	}

	backup, err := os.ReadFile(filepath.Join(vol, "workspace", "AGENT.cliente.md"))
	if err != nil {
		t.Fatalf("read backup: %v", err)
	}
	if string(backup) != canonical {
		t.Errorf("backup must still hold canonical after re-apply.\nwant: %q\ngot:  %q",
			canonical, backup)
	}
}

func TestApplyPublicSofiaAgentMD_UsesPublicAgentFileWhenPresent(t *testing.T) {
	const canonical = "# AGENT original\n"
	vol := setupWorkspaceVolume(t, canonical)
	publicPrompt := "---\nname: sofia-discovery-mode\n---\n\n# AGENT publico custom\n\nVocê é a **Sofia**.\nMARCador-publico-versionado\n"
	publicPath := filepath.Join(vol, "workspace", "agents", "sofia", "AGENT.public.md")
	if err := os.MkdirAll(filepath.Dir(publicPath), 0o755); err != nil {
		t.Fatalf("mkdir public prompt dir: %v", err)
	}
	if err := os.WriteFile(publicPath, []byte(publicPrompt), 0o644); err != nil {
		t.Fatalf("write public prompt: %v", err)
	}

	if err := ApplyPublicSofiaAgentMD(vol); err != nil {
		t.Fatalf("ApplyPublicSofiaAgentMD: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(vol, "workspace", "AGENT.md"))
	if err != nil {
		t.Fatalf("read AGENT.md: %v", err)
	}
	if string(got) != publicPrompt {
		t.Fatalf("AGENT.md did not use AGENT.public.md:\nwant %q\ngot  %q", publicPrompt, got)
	}
}

func TestRestoreClienteAgentMD_RestoresAndCleansBackup(t *testing.T) {
	const canonical = "# AGENT original team\n- Rafael\n- Clara\n"
	vol := setupWorkspaceVolume(t, canonical)

	// Simulate prior public state: backup exists, AGENT.md is the Sofia mode.
	if err := ApplyPublicSofiaAgentMD(vol); err != nil {
		t.Fatalf("ApplyPublicSofiaAgentMD: %v", err)
	}

	// Now restore (simulates the promote handler running).
	if err := RestoreClienteAgentMD(vol); err != nil {
		t.Fatalf("RestoreClienteAgentMD: %v", err)
	}

	// AGENT.md is back to canonical.
	got, err := os.ReadFile(filepath.Join(vol, "workspace", "AGENT.md"))
	if err != nil {
		t.Fatalf("read AGENT.md: %v", err)
	}
	if string(got) != canonical {
		t.Errorf("AGENT.md not restored:\nwant: %q\ngot:  %q", canonical, got)
	}

	// Backup file is gone (cleanup so a future re-promote doesn't restore
	// stale content).
	if _, err := os.Stat(filepath.Join(vol, "workspace", "AGENT.cliente.md")); !os.IsNotExist(err) {
		t.Errorf("AGENT.cliente.md should be removed after restore, got err=%v", err)
	}
}

func TestRestoreClienteAgentMD_NoBackupIsNoop(t *testing.T) {
	// Cliente tenant that was NEVER public — no backup exists.
	const canonical = "# AGENT cliente direto\n"
	vol := setupWorkspaceVolume(t, canonical)

	// Restore should be a no-op (no error, file untouched).
	if err := RestoreClienteAgentMD(vol); err != nil {
		t.Errorf("RestoreClienteAgentMD on tenant without backup should be no-op, got %v", err)
	}

	got, _ := os.ReadFile(filepath.Join(vol, "workspace", "AGENT.md"))
	if string(got) != canonical {
		t.Errorf("AGENT.md must be untouched when no backup exists:\nwant: %q\ngot:  %q",
			canonical, got)
	}
}

func TestApplyPublicSofiaAgentMD_MissingOriginalStillWritesSofia(t *testing.T) {
	// Edge case: workspace exists but no AGENT.md (non-standard, but the
	// override should still succeed — Sofia mode is more important than the
	// backup).
	vol := t.TempDir()
	if err := os.MkdirAll(filepath.Join(vol, "workspace"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	if err := ApplyPublicSofiaAgentMD(vol); err != nil {
		t.Fatalf("ApplyPublicSofiaAgentMD: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(vol, "workspace", "AGENT.md"))
	if err != nil {
		t.Fatalf("read AGENT.md: %v", err)
	}
	if !strings.Contains(string(got), "Sofia") {
		t.Error("expected Sofia content even without prior AGENT.md")
	}

	// Backup should NOT exist — there was nothing to back up.
	if _, err := os.Stat(filepath.Join(vol, "workspace", "AGENT.cliente.md")); !os.IsNotExist(err) {
		t.Errorf("should not have created backup when original was missing, err=%v", err)
	}
}
