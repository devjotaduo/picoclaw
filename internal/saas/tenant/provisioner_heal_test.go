package tenant

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// healWorkspaceBaseline must additively heal the SELECTED workspace's home/
// before the provisioner copies it into a tenant volume. Without it, a tenant
// created from a manual (non-default-auto) workspace that predates a newly
// required baseline file (e.g. agents/sofia/AGENT.public.md, #180) fails
// provisioning: the boot-time seed only heals the default-auto workspace.
func TestHealWorkspaceBaselineCallsHealerWithHomeDir(t *testing.T) {
	var gotHome string
	p := &Provisioner{BaselineHealer: func(home string) error {
		gotHome = home
		return nil
	}}
	ws := &store.Workspace{ID: "w1", HostPath: filepath.Join("srv", "ws", "publico")}

	p.healWorkspaceBaseline(ws)

	want := filepath.Join("srv", "ws", "publico", WorkspaceHomeSubdir)
	if gotHome != want {
		t.Fatalf("healer called with wrong dir:\n want %q\n got  %q", want, gotHome)
	}
}

// Raw workspaces opt out of every post-copy transformation; the operator wants
// their exact bytes. The heal must respect that.
func TestHealWorkspaceBaselineSkipsRawWorkspace(t *testing.T) {
	called := false
	p := &Provisioner{BaselineHealer: func(string) error {
		called = true
		return nil
	}}

	p.healWorkspaceBaseline(&store.Workspace{ID: "raw", HostPath: "x", IsRaw: true})

	if called {
		t.Fatal("raw workspace must not be healed")
	}
}

// A nil healer (unit tests, tenantctl) and a nil workspace must be safe no-ops.
func TestHealWorkspaceBaselineSafeWhenUnset(t *testing.T) {
	(&Provisioner{}).healWorkspaceBaseline(&store.Workspace{HostPath: "x"})
	(&Provisioner{BaselineHealer: func(string) error { return nil }}).healWorkspaceBaseline(nil)
}

// A healer error is non-fatal: heal is best-effort, and any file a later step
// actually needs is gated by that step (ApplyPublicSofiaAgentMD fails loud).
func TestHealWorkspaceBaselineSwallowsHealerError(t *testing.T) {
	p := &Provisioner{BaselineHealer: func(string) error {
		return errors.New("boom")
	}}
	// Must not panic or propagate.
	p.healWorkspaceBaseline(&store.Workspace{ID: "w", HostPath: "x"})
}
