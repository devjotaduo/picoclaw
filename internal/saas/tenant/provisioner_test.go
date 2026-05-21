package tenant

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// TestCreateInput_Normalize exercises the small input-mutation contract
// invoked at the top of Provisioner.Create via in.normalize():
//
//	if in.IsPublic { in.SkipDashboardPassword = true }
//
// We don't drive the full Create() path here because it needs a real Postgres
// DB, Docker daemon, and LiteLLM endpoint. The intent of this test is to lock
// the public-tenant invariant: a public tenant MUST NOT receive a bcrypt
// dashboard password — there's no human owner to log in with one.
func TestCreateInput_Normalize(t *testing.T) {
	cases := []struct {
		name     string
		input    CreateInput
		wantSkip bool
	}{
		{"public tenant forces skip", CreateInput{IsPublic: true}, true},
		{"private + caller skip=false stays false", CreateInput{IsPublic: false, SkipDashboardPassword: false}, false},
		{
			"private + caller skip=true stays true (idempotent)",
			CreateInput{IsPublic: false, SkipDashboardPassword: true},
			true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.input
			in.normalize()
			if in.SkipDashboardPassword != tc.wantSkip {
				t.Errorf("SkipDashboardPassword: got %v, want %v", in.SkipDashboardPassword, tc.wantSkip)
			}
		})
	}
}

// TestBuildSpec_PublicTenantInjectsOnboardingEnv locks the contract between
// the provisioner and the onboarding tenant's skill scripts: when IsPublic
// is true, the container must receive both PICOCLAW_ONBOARDING_CALLBACK_*
// vars plus the public-web allowlist override. Regular tenants must NOT
// receive them — propagating the secret broadens the blast radius.
func TestBuildSpec_PublicTenantInjectsOnboardingEnv(t *testing.T) {
	p := &Provisioner{
		Cfg: &config.Config{
			GatewaySharedSecret:      "gw-secret",
			OnboardingCallbackSecret: "hmac-secret",
			OnboardingCallbackURL:    "https://adm.example.com",
		},
	}

	t.Run("public tenant gets onboarding env + public-web allowlist", func(t *testing.T) {
		spec := p.buildSpec(&store.Tenant{ID: "t1", IsPublic: true})
		if got := spec.Env["PICOCLAW_ONBOARDING_CALLBACK_SECRET"]; got != "hmac-secret" {
			t.Errorf("CALLBACK_SECRET = %q, want %q", got, "hmac-secret")
		}
		if got := spec.Env["PICOCLAW_ONBOARDING_CALLBACK_URL"]; got != "https://adm.example.com" {
			t.Errorf("CALLBACK_URL = %q, want %q", got, "https://adm.example.com")
		}
		if got := spec.Env["PICOCLAW_ALLOWED_CHANNELS"]; got != "public-web" {
			t.Errorf("ALLOWED_CHANNELS = %q, want %q", got, "public-web")
		}
	})

	t.Run("private tenant does NOT see onboarding env", func(t *testing.T) {
		spec := p.buildSpec(&store.Tenant{ID: "t2", IsPublic: false})
		if _, ok := spec.Env["PICOCLAW_ONBOARDING_CALLBACK_SECRET"]; ok {
			t.Errorf("private tenant unexpectedly got CALLBACK_SECRET")
		}
		if _, ok := spec.Env["PICOCLAW_ONBOARDING_CALLBACK_URL"]; ok {
			t.Errorf("private tenant unexpectedly got CALLBACK_URL")
		}
		if got := spec.Env["PICOCLAW_ALLOWED_CHANNELS"]; got != "whatsapp_native" {
			t.Errorf("ALLOWED_CHANNELS = %q, want %q (default)", got, "whatsapp_native")
		}
	})
}

// TestBuildSpec_WorkspaceMountAttached verifies the second bind-mount that
// the new Workspace flow adds when the workspace has a compiled frontend.
// We exercise the on-disk HasBuiltFrontend gate (an index.html with size>0
// flips it on) and confirm the env var the launcher reads is set.
//
// We bypass the WorkspaceStore by leaving p.Workspaces nil — buildSpec
// short-circuits on that path. To exercise the mount-attaching code we'd
// need a fake store; that's a smoke-test concern, not a unit test. Instead
// this test locks the negative path: a tenant with WorkspaceID set but no
// WorkspaceStore wired must NOT crash and must NOT add the extra mount.
func TestBuildSpec_WorkspaceMountSkippedWithoutStore(t *testing.T) {
	wsID := "ws-test"
	p := &Provisioner{Cfg: &config.Config{GatewaySharedSecret: "gw"}}
	spec := p.buildSpec(&store.Tenant{ID: "t1", WorkspaceID: &wsID})
	if len(spec.ExtraMounts) != 0 {
		t.Errorf("expected no ExtraMounts when Workspaces store is nil, got %d", len(spec.ExtraMounts))
	}
	if _, ok := spec.Env["PICOCLAW_FRONTEND_DIST_DIR"]; ok {
		t.Errorf("expected PICOCLAW_FRONTEND_DIST_DIR unset without built workspace, found")
	}
}

// TestHasBuiltFrontend_DistTriggersMount confirms the gating helper agrees
// with what runProvisionWorkspace + buildSpec rely on. Together with the
// integration smoke test this is enough to trust the bind-mount wiring
// without spinning up a real Postgres+Docker harness in unit tests.
func TestHasBuiltFrontend_DistTriggersMount(t *testing.T) {
	ws := t.TempDir()
	if HasBuiltFrontend(ws) {
		t.Fatal("expected false for empty workspace")
	}
	distDir := filepath.Join(ws, WorkspaceFrontendDistSubdir)
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !HasBuiltFrontend(ws) {
		t.Fatal("expected true after writing non-empty index.html")
	}
}
