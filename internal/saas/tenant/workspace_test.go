package tenant

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCopyWorkspaceHome verifies the workspace home subtree lands in the
// tenant volume verbatim, mode bits preserved, with nested directories
// created on demand. This is the only copy step in the new provisioning
// flow — if it diverges from the on-disk layout the operator sees, every
// downstream debug becomes confusing.
func TestCopyWorkspaceHome(t *testing.T) {
	wsRoot := t.TempDir()
	homeSrc := filepath.Join(wsRoot, WorkspaceHomeSubdir)

	files := map[string]string{
		"config.json":                     `{"model_list":[{"api_key":"${LITELLM_KEY}"}]}`,
		".security.yml":                   "permissions: []",
		"workspace/AGENT.md":              "# Clara\n",
		"workspace/SOUL.md":               "voz: BR-PT",
		"workspace/agents/sofia/AGENT.md": "# Sofia",
	}
	for rel, content := range files {
		path := filepath.Join(homeSrc, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("setup mkdir %s: %v", rel, err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("setup write %s: %v", rel, err)
		}
	}

	dst := filepath.Join(t.TempDir(), "tenant-vol")
	if err := CopyWorkspaceHome(wsRoot, dst); err != nil {
		t.Fatalf("CopyWorkspaceHome: %v", err)
	}

	for rel, want := range files {
		got, err := os.ReadFile(filepath.Join(dst, rel))
		if err != nil {
			t.Errorf("missing %s: %v", rel, err)
			continue
		}
		if string(got) != want {
			t.Errorf("content mismatch for %s: got %q, want %q", rel, got, want)
		}
	}
}

func TestCopyWorkspaceHome_MissingHomeDir(t *testing.T) {
	// A workspace without a home/ subdir is a broken workspace — surface
	// the error rather than silently creating an empty tenant.
	if err := CopyWorkspaceHome(t.TempDir(), filepath.Join(t.TempDir(), "tenant")); err == nil {
		t.Fatal("expected error when home/ is missing, got nil")
	}
}

// TestSubstituteConfigPlaceholders confirms that the placeholder in
// config.json is replaced with the real LiteLLM key and that
// non-placeholder files outside placeholderFiles are NOT scanned (so a
// binary file like dashboardauth.db can't be corrupted by a stray byte
// sequence matching a placeholder).
func TestSubstituteConfigPlaceholders(t *testing.T) {
	dst := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dst, "workspace"), 0o755); err != nil {
		t.Fatal(err)
	}

	must := func(rel, content string) {
		t.Helper()
		path := filepath.Join(dst, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	must("config.json", `{"api_key":"${LITELLM_KEY}","tenant":"${TENANT_ID}"}`)
	must(".security.yml", "permissions: ${LITELLM_KEY}")
	// A "binary" file that happens to contain the placeholder string but
	// lives OUTSIDE placeholderFiles — must NOT be modified.
	must("workspace/skills/raw/data.bin", "irrelevant ${LITELLM_KEY} bytes")

	err := SubstituteConfigPlaceholders(dst, map[string]string{
		"${LITELLM_KEY}": "sk-real-key-12345",
		"${TENANT_ID}":   "t-abcdef",
	})
	if err != nil {
		t.Fatalf("SubstituteConfigPlaceholders: %v", err)
	}

	cfg, _ := os.ReadFile(filepath.Join(dst, "config.json"))
	if want := `{"api_key":"sk-real-key-12345","tenant":"t-abcdef"}`; string(cfg) != want {
		t.Errorf("config.json: got %q, want %q", cfg, want)
	}

	sec, _ := os.ReadFile(filepath.Join(dst, ".security.yml"))
	if !strings.Contains(string(sec), "sk-real-key-12345") {
		t.Errorf(".security.yml not substituted: %q", sec)
	}

	bin, _ := os.ReadFile(filepath.Join(dst, "workspace/skills/raw/data.bin"))
	if !strings.Contains(string(bin), "${LITELLM_KEY}") {
		t.Errorf(
			"data.bin was unexpectedly substituted — placeholder scan must be limited to known config files: %q",
			bin,
		)
	}
}

// TestSubstituteConfigPlaceholders_MissingFileIsOk tests the fact that a
// workspace doesn't have to ship every optional config file. Skipping
// missing ones lets the provisioner stay generic.
func TestSubstituteConfigPlaceholders_MissingFileIsOk(t *testing.T) {
	dst := t.TempDir()
	if err := os.WriteFile(filepath.Join(dst, "config.json"), []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := SubstituteConfigPlaceholders(dst, map[string]string{"${X}": "y"}); err != nil {
		t.Fatalf("expected nil for workspace with only config.json, got %v", err)
	}
}

func TestHasBuiltFrontend(t *testing.T) {
	ws := t.TempDir()
	if HasBuiltFrontend(ws) {
		t.Fatal("expected false for empty workspace")
	}
	distDir := filepath.Join(ws, WorkspaceFrontendDistSubdir)
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Empty file still counts as not-built (zero size).
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte{}, 0o644); err != nil {
		t.Fatal(err)
	}
	if HasBuiltFrontend(ws) {
		t.Fatal("expected false for zero-byte index.html")
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !HasBuiltFrontend(ws) {
		t.Fatal("expected true when index.html is non-empty")
	}
}
