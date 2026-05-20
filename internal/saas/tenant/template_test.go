package tenant

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSyncTemplateSkillsFillsMissingSkillsWithoutClobberingProfile(t *testing.T) {
	templateDir := t.TempDir()
	tenantDir := t.TempDir()

	mustWriteFile(t,
		filepath.Join(templateDir, "workspace", "skills", "new-skill", "SKILL.md"),
		"new skill from main template",
		0o644,
	)
	mustWriteFile(t,
		filepath.Join(templateDir, "workspace", "skills", "shared-skill", "SKILL.md"),
		"operator version of shared skill",
		0o644,
	)
	mustWriteFile(t,
		filepath.Join(tenantDir, "workspace", "skills", "shared-skill", "SKILL.md"),
		"profile-customised version",
		0o644,
	)
	mustWriteFile(t,
		filepath.Join(tenantDir, "workspace", "skills", "profile-only", "SKILL.md"),
		"profile-specific skill",
		0o644,
	)

	if err := SyncTemplateSkills(templateDir, tenantDir); err != nil {
		t.Fatalf("SyncTemplateSkills: %v", err)
	}

	assertFileContent(t,
		filepath.Join(tenantDir, "workspace", "skills", "new-skill", "SKILL.md"),
		"new skill from main template",
	)
	// Profile-customised skill must survive — operator template is fallback only.
	assertFileContent(t,
		filepath.Join(tenantDir, "workspace", "skills", "shared-skill", "SKILL.md"),
		"profile-customised version",
	)
	assertFileContent(t,
		filepath.Join(tenantDir, "workspace", "skills", "profile-only", "SKILL.md"),
		"profile-specific skill",
	)
}

func TestOverlayWorkspaceSeedsAgentFilesAndPreservesRuntime(t *testing.T) {
	src := t.TempDir()
	tenantVol := t.TempDir()

	// Operator-side workspace (the source of the overlay).
	mustWriteFile(t, filepath.Join(src, "AGENT.md"), "rafael+clara+marcos+camila team", 0o644)
	mustWriteFile(t, filepath.Join(src, "HEARTBEAT.md"), "12-point proactive scan", 0o644)
	mustWriteFile(t, filepath.Join(src, "agents", "rafael-assistente-interno.md"), "Rafael", 0o644)
	mustWriteFile(t, filepath.Join(src, "skills", "interno", "monitorar-operacao", "SKILL.md"), "monitor", 0o644)
	mustWriteFile(t, filepath.Join(src, "cron", "jobs.json"), `{"jobs":[]}`, 0o644)
	mustWriteFile(t, filepath.Join(src, "config", "company-profile.md"), "Nome:", 0o644)
	// Operator runtime state — MUST NOT leak into tenant.
	mustWriteFile(t, filepath.Join(src, "heartbeat.log"), "2026 channel=pico:abc", 0o644)
	mustWriteFile(t, filepath.Join(src, "whatsapp", "store.db"), "operator session", 0o644)
	mustWriteFile(t, filepath.Join(src, "sessions", "session-1.jsonl"), "operator turns", 0o644)
	mustWriteFile(t, filepath.Join(src, "state", "state.json"), `{"last_channel":"pico"}`, 0o644)
	// memory/ templates the tenant should receive on first overlay.
	mustWriteFile(t, filepath.Join(src, "memory", "empresa.md"), "Nome:\nSegmento:", 0o644)
	mustWriteFile(t, filepath.Join(src, "memory", "leads.md"), "Modelo:", 0o644)

	if err := OverlayWorkspace(src, tenantVol); err != nil {
		t.Fatalf("OverlayWorkspace: %v", err)
	}
	ws := filepath.Join(tenantVol, "workspace")

	// Behavior files shipped.
	assertFileContent(t, filepath.Join(ws, "AGENT.md"), "rafael+clara+marcos+camila team")
	assertFileContent(t, filepath.Join(ws, "HEARTBEAT.md"), "12-point proactive scan")
	assertFileContent(t, filepath.Join(ws, "agents", "rafael-assistente-interno.md"), "Rafael")
	assertFileContent(t, filepath.Join(ws, "skills", "interno", "monitorar-operacao", "SKILL.md"), "monitor")
	assertFileContent(t, filepath.Join(ws, "cron", "jobs.json"), `{"jobs":[]}`)
	assertFileContent(t, filepath.Join(ws, "config", "company-profile.md"), "Nome:")
	// memory/ templates seeded on first overlay (no existing dst).
	assertFileContent(t, filepath.Join(ws, "memory", "empresa.md"), "Nome:\nSegmento:")
	assertFileContent(t, filepath.Join(ws, "memory", "leads.md"), "Modelo:")

	// Runtime state must NOT have been copied.
	for _, leak := range []string{
		filepath.Join(ws, "heartbeat.log"),
		filepath.Join(ws, "whatsapp", "store.db"),
		filepath.Join(ws, "sessions", "session-1.jsonl"),
		filepath.Join(ws, "state", "state.json"),
	} {
		if _, err := os.Stat(leak); err == nil {
			t.Errorf("operator runtime file leaked into tenant: %s", leak)
		}
	}
}

func TestOverlayWorkspaceMemoryIsNonClobbering(t *testing.T) {
	src := t.TempDir()
	tenantVol := t.TempDir()

	// Operator's template memory.
	mustWriteFile(t, filepath.Join(src, "memory", "empresa.md"), "TEMPLATE (empty fields)", 0o644)
	mustWriteFile(t, filepath.Join(src, "memory", "leads.md"), "TEMPLATE leads", 0o644)
	// Tenant has already accumulated knowledge in empresa.md from earlier turns.
	mustWriteFile(t, filepath.Join(tenantVol, "workspace", "memory", "empresa.md"),
		"Nome: Acme\nSegmento: SaaS\n(real data)", 0o644)

	if err := OverlayWorkspace(src, tenantVol); err != nil {
		t.Fatalf("OverlayWorkspace: %v", err)
	}
	ws := filepath.Join(tenantVol, "workspace")

	// Existing tenant memory file must survive untouched.
	assertFileContent(t, filepath.Join(ws, "memory", "empresa.md"),
		"Nome: Acme\nSegmento: SaaS\n(real data)")
	// Missing memory file gets the template (so new files added later in
	// the operator workspace propagate to existing tenants).
	assertFileContent(t, filepath.Join(ws, "memory", "leads.md"), "TEMPLATE leads")
}

func mustWriteFile(t *testing.T, path, content string, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func assertFileContent(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if string(got) != want {
		t.Fatalf("%s = %q, want %q", path, string(got), want)
	}
}
