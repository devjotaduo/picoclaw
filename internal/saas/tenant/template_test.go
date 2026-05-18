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
