package tenant

import (
	"context"
	"os"
	"path/filepath"
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

	t.Run("env set + dir exists → read-only mount attached", func(t *testing.T) {
		// Real temp dir so os.Stat passes.
		authDir := t.TempDir()
		// Throw a placeholder file so it's not totally empty (more realistic).
		if err := os.WriteFile(filepath.Join(authDir, "credentials.json"), []byte("{}"), 0o600); err != nil {
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

	t.Run("both claude + codex configured → both mounts attached, both read-only", func(t *testing.T) {
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
		if len(mounts) != 2 {
			t.Fatalf("expected 2 CLI auth mounts, got %d (%+v)", len(mounts), mounts)
		}
		for target, m := range mounts {
			if !m.ReadOnly {
				t.Errorf("%s mount must be read-only (no tenant token rotation)", target)
			}
		}
		if mounts["/root/.claude"].Source != claudeDir {
			t.Errorf("/root/.claude source = %q, want %q", mounts["/root/.claude"].Source, claudeDir)
		}
		if mounts["/root/.codex"].Source != codexDir {
			t.Errorf("/root/.codex source = %q, want %q", mounts["/root/.codex"].Source, codexDir)
		}
	})

	t.Run("only codex configured → only codex mount (claude unset = no claude mount)", func(t *testing.T) {
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
		if !hasCodex {
			t.Error("expected /root/.codex mount when TenantCodexCliAuthDir is set")
		}
	})
}
