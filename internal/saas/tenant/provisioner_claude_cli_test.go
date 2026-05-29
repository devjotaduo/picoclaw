package tenant

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// TestBuildSpec_ClaudeCliAuthBindMount locks the contract between the operator
// runbook (docs/operations/claude-cli-provider.md) and the provisioner:
// when the operator sets PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR + the dir
// exists, every tenant gets /root/.claude bound read-only from the host.
// When unset OR missing, the mount is silently skipped so tenants without
// a configured claude-cli provider still boot.
func TestBuildSpec_ClaudeCliAuthBindMount(t *testing.T) {
	t.Run("env unset → no mount, no error", func(t *testing.T) {
		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret: "gw",
				// TenantClaudeCliAuthDir intentionally empty
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t1"})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		for _, m := range spec.ExtraMounts {
			if m.Target == "/root/.claude" {
				t.Errorf("unexpected /root/.claude mount when env unset: %+v", m)
			}
		}
	})

	t.Run("env set but dir missing → no mount, no error", func(t *testing.T) {
		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret:    "gw",
				TenantClaudeCliAuthDir: "/nonexistent/claude-auth-dir-xyz123",
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t2"})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		for _, m := range spec.ExtraMounts {
			if m.Target == "/root/.claude" {
				t.Errorf("unexpected mount for missing dir: %+v", m)
			}
		}
	})

	t.Run("env set + claude credential dir exists → read-only mount attached", func(t *testing.T) {
		// Real temp dir so os.Stat passes.
		authDir := t.TempDir()
		// Throw a placeholder file so it's not totally empty (more realistic).
		if err := os.WriteFile(filepath.Join(authDir, ".credentials.json"), []byte("{}"), 0o600); err != nil {
			t.Fatalf("seed credentials: %v", err)
		}

		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret:    "gw",
				TenantClaudeCliAuthDir: authDir,
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t3"})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}

		var found *ContainerMount
		for i := range spec.ExtraMounts {
			if spec.ExtraMounts[i].Target == "/root/.claude" {
				found = &spec.ExtraMounts[i]
				break
			}
		}
		if found == nil {
			t.Fatal("expected /root/.claude mount to be attached")
		}
		if found.Source != authDir {
			t.Errorf("Source = %q, want %q", found.Source, authDir)
		}
		if !found.ReadOnly {
			t.Error("claude-cli auth mount MUST be read-only (tenant must not rotate the operator's tokens)")
		}
	})

	t.Run("env can point at parent HOME dir from runbook", func(t *testing.T) {
		parentDir := t.TempDir()
		authDir := filepath.Join(parentDir, ".claude")
		if err := os.MkdirAll(authDir, 0o700); err != nil {
			t.Fatalf("mkdir claude auth dir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(authDir, ".credentials.json"), []byte("{}"), 0o600); err != nil {
			t.Fatalf("seed credentials: %v", err)
		}

		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret:    "gw",
				TenantClaudeCliAuthDir: parentDir,
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t3-parent"})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}

		var found *ContainerMount
		for i := range spec.ExtraMounts {
			if spec.ExtraMounts[i].Target == "/root/.claude" {
				found = &spec.ExtraMounts[i]
				break
			}
		}
		if found == nil {
			t.Fatal("expected /root/.claude mount to be attached")
		}
		if found.Source != authDir {
			t.Errorf("Source = %q, want nested claude auth dir %q", found.Source, authDir)
		}
	})

	t.Run("path is a regular file (not a directory) → no mount", func(t *testing.T) {
		// Operator typo edge case: pointed at credentials.json instead of the
		// containing dir. Provisioner should NOT attach a file as a directory
		// mount — would either fail at docker create time or worse, mount
		// confusingly. Stat check filters it.
		file := filepath.Join(t.TempDir(), "not-a-dir.json")
		if err := os.WriteFile(file, []byte("{}"), 0o600); err != nil {
			t.Fatalf("seed file: %v", err)
		}
		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret:    "gw",
				TenantClaudeCliAuthDir: file,
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t4"})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		for _, m := range spec.ExtraMounts {
			if m.Target == "/root/.claude" {
				t.Errorf("unexpected mount when path is a regular file: %+v", m)
			}
		}
	})

	t.Run("both claude + codex configured → claude mount and codex writable home env", func(t *testing.T) {
		// Fallback chain use case: operator configured BOTH so claude-cli
		// can fail over to codex-cli without service disruption.
		claudeDir := t.TempDir()
		codexDir := t.TempDir()
		_ = os.WriteFile(filepath.Join(claudeDir, ".credentials.json"), []byte("{}"), 0o600)
		_ = os.WriteFile(filepath.Join(codexDir, "auth.json"), []byte("{}"), 0o600)

		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret:    "gw",
				TenantClaudeCliAuthDir: claudeDir,
				TenantCodexCliAuthDir:  codexDir,
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t5"})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}

		mounts := map[string]ContainerMount{}
		for _, m := range spec.ExtraMounts {
			if m.Target == "/root/.claude" || m.Target == "/root/.codex" {
				mounts[m.Target] = m
			}
		}
		if len(mounts) != 1 {
			t.Fatalf("expected only the claude auth mount, got %d (%+v)", len(mounts), mounts)
		}
		if mounts["/root/.claude"].Source != claudeDir {
			t.Errorf("/root/.claude source = %q, want %q", mounts["/root/.claude"].Source, claudeDir)
		}
		if !mounts["/root/.claude"].ReadOnly {
			t.Error("/root/.claude mount must be read-only (tenant must not rotate the operator's tokens)")
		}
		if _, ok := mounts["/root/.codex"]; ok {
			t.Fatal("codex-cli must not be bind-mounted read-only; codex exec writes under CODEX_HOME")
		}
		if got := spec.Env["CODEX_HOME"]; got != tenantCodexCLIHomeContainer {
			t.Errorf("CODEX_HOME = %q, want %q", got, tenantCodexCLIHomeContainer)
		}
	})

	t.Run("only codex configured → CODEX_HOME set without auth mount", func(t *testing.T) {
		// Independence check: codex doesn't require claude to be present.
		codexDir := t.TempDir()
		_ = os.WriteFile(filepath.Join(codexDir, "auth.json"), []byte("{}"), 0o600)

		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret:   "gw",
				TenantCodexCliAuthDir: codexDir,
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t6"})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		hasClaude := false
		hasCodex := false
		for _, m := range spec.ExtraMounts {
			if m.Target == "/root/.claude" {
				hasClaude = true
			}
			if m.Target == "/root/.codex" {
				hasCodex = true
			}
		}
		if hasClaude {
			t.Error("unexpected /root/.claude mount when TenantClaudeCliAuthDir is unset")
		}
		if hasCodex {
			t.Error("unexpected /root/.codex mount; codex uses writable CODEX_HOME inside the tenant volume")
		}
		if got := spec.Env["CODEX_HOME"]; got != tenantCodexCLIHomeContainer {
			t.Errorf("CODEX_HOME = %q, want %q", got, tenantCodexCLIHomeContainer)
		}
	})
}

func TestPrepareCodexCLIHomeCopiesWritableSnapshot(t *testing.T) {
	src := t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "auth.json"), []byte(`{"token":"one"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "config.toml"), []byte("model = \"gpt\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(src, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "nested", "state.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}

	volume := t.TempDir()
	if err := prepareCodexCLIHome(volume, src); err != nil {
		t.Fatalf("prepareCodexCLIHome: %v", err)
	}

	dst := filepath.Join(volume, tenantCodexCLIHomeRel)
	if got, err := os.ReadFile(filepath.Join(dst, "auth.json")); err != nil || string(got) != `{"token":"one"}` {
		t.Fatalf("auth.json snapshot = %q, %v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(dst, "config.toml")); err != nil || string(got) != "model = \"gpt\"\n" {
		t.Fatalf("config.toml snapshot = %q, %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(dst, "nested", "state.json")); !os.IsNotExist(err) {
		t.Fatalf("nested state should not be copied, err=%v", err)
	}

	if runtime.GOOS != "windows" {
		info, err := os.Stat(dst)
		if err != nil {
			t.Fatalf("stat codex home: %v", err)
		}
		if info.Mode().Perm() != 0o700 {
			t.Fatalf("codex home mode = %v; want 0700", info.Mode().Perm())
		}
		info, err = os.Stat(filepath.Join(dst, "config.toml"))
		if err != nil {
			t.Fatalf("stat config.toml: %v", err)
		}
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("config.toml mode = %v; want 0600", info.Mode().Perm())
		}
	}
}

func TestProvisionerSharedCLIModelRoutingRequiresCredentialFiles(t *testing.T) {
	t.Run("unset, missing, or empty dirs disable cli routing", func(t *testing.T) {
		p := &Provisioner{Cfg: &config.Config{}}
		claude, codex := p.sharedCLIModelRouting()
		if claude || codex {
			t.Fatalf("sharedCLIModelRouting() = %v, %v; want both false", claude, codex)
		}

		p.Cfg.TenantClaudeCliAuthDir = "/nonexistent/claude-auth-dir-xyz123"
		p.Cfg.TenantCodexCliAuthDir = "/nonexistent/codex-auth-dir-xyz123"
		claude, codex = p.sharedCLIModelRouting()
		if claude || codex {
			t.Fatalf("sharedCLIModelRouting() with missing dirs = %v, %v; want both false", claude, codex)
		}

		p.Cfg.TenantClaudeCliAuthDir = t.TempDir()
		p.Cfg.TenantCodexCliAuthDir = t.TempDir()
		claude, codex = p.sharedCLIModelRouting()
		if claude || codex {
			t.Fatalf("sharedCLIModelRouting() with empty dirs = %v, %v; want both false", claude, codex)
		}
	})

	t.Run("existing claude and codex dirs enable both providers", func(t *testing.T) {
		claudeDir := t.TempDir()
		codexDir := t.TempDir()
		if err := os.WriteFile(filepath.Join(claudeDir, ".credentials.json"), []byte("{}"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(codexDir, "auth.json"), []byte("{}"), 0o600); err != nil {
			t.Fatal(err)
		}
		p := &Provisioner{
			Cfg: &config.Config{
				TenantClaudeCliAuthDir: claudeDir,
				TenantCodexCliAuthDir:  codexDir,
			},
		}

		claude, codex := p.sharedCLIModelRouting()
		if !claude || !codex {
			t.Fatalf("sharedCLIModelRouting() = %v, %v; want both true", claude, codex)
		}
	})

	t.Run("codex can be used without claude", func(t *testing.T) {
		codexDir := t.TempDir()
		if err := os.WriteFile(filepath.Join(codexDir, "auth.json"), []byte("{}"), 0o600); err != nil {
			t.Fatal(err)
		}
		p := &Provisioner{
			Cfg: &config.Config{
				TenantCodexCliAuthDir: codexDir,
			},
		}

		claude, codex := p.sharedCLIModelRouting()
		if claude || !codex {
			t.Fatalf("sharedCLIModelRouting() = %v, %v; want false, true", claude, codex)
		}
	})

	t.Run("regular file does not enable routing", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "auth.json")
		if err := os.WriteFile(file, []byte("{}"), 0o600); err != nil {
			t.Fatal(err)
		}
		p := &Provisioner{
			Cfg: &config.Config{
				TenantClaudeCliAuthDir: file,
				TenantCodexCliAuthDir:  file,
			},
		}

		claude, codex := p.sharedCLIModelRouting()
		if claude || codex {
			t.Fatalf("sharedCLIModelRouting() with file paths = %v, %v; want both false", claude, codex)
		}
	})
}
