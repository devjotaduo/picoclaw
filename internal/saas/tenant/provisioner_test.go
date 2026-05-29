package tenant

import (
	"context"
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

// TestBuildSpec_PublicTenantInjectsPublicEnv locks the public-tenant contract:
// public tenants get the sentinel env and keep the same browser chat channel
// allowlist as regular tenants: whatsapp_native + pico.
func TestBuildSpec_PublicTenantInjectsPublicEnv(t *testing.T) {
	p := &Provisioner{
		Cfg: &config.Config{
			GatewaySharedSecret: "gw-secret",
		},
	}

	t.Run("public tenant gets public marker + pico allowlist", func(t *testing.T) {
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t1", IsPublic: true})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		if got := spec.Env["PICOCLAW_ALLOWED_CHANNELS"]; got != "whatsapp_native,pico" {
			t.Errorf("ALLOWED_CHANNELS = %q, want %q", got, "whatsapp_native,pico")
		}
		if got := spec.Env["PICOCLAW_PUBLIC_TENANT"]; got != "true" {
			t.Errorf("PUBLIC_TENANT = %q, want true", got)
		}
	})

	t.Run("private tenant does NOT see public marker", func(t *testing.T) {
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t2", IsPublic: false})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		if got := spec.Env["PICOCLAW_ALLOWED_CHANNELS"]; got != "whatsapp_native,pico" {
			t.Errorf("ALLOWED_CHANNELS = %q, want %q (default includes pico for in-browser chat)", got, "whatsapp_native,pico")
		}
		if _, ok := spec.Env["PICOCLAW_PUBLIC_TENANT"]; ok {
			t.Errorf("private tenant unexpectedly got PUBLIC_TENANT")
		}
	})
}

// TestBuildSpec_PublicTenantInjectsJotaduoWAEnv locks the contract between
// the provisioner and the public-tenant skill `enviar-whatsapp-jotaduo`:
// when IsPublic is true AND the controlplane has a JotaduoWAHMACSecret, the
// container must receive JOTADUO_WA_URL + JOTADUO_WA_HMAC_SECRET. Cliente
// tenants must NEVER receive them — after promotion the recreate strips
// these envs so the cliente loses access to the institutional WA. Empty
// secret on the controlplane must skip injection so existing deployments
// pre-sidecar keep working unchanged.
func TestBuildSpec_PublicTenantInjectsJotaduoWAEnv(t *testing.T) {
	t.Run("public tenant with configured secret gets both envs", func(t *testing.T) {
		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret: "gw",
				JotaduoWAURL:        "http://jotaduo-wa:18810",
				JotaduoWAHMACSecret: "wa-secret",
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "pub1", IsPublic: true})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		if got := spec.Env["JOTADUO_WA_URL"]; got != "http://jotaduo-wa:18810" {
			t.Errorf("JOTADUO_WA_URL = %q, want sidecar URL", got)
		}
		if got := spec.Env["JOTADUO_WA_HMAC_SECRET"]; got != "wa-secret" {
			t.Errorf("JOTADUO_WA_HMAC_SECRET = %q, want %q", got, "wa-secret")
		}
	})

	t.Run("public tenant without configured secret skips injection", func(t *testing.T) {
		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret: "gw",
				JotaduoWAURL:        "http://jotaduo-wa:18810",
				JotaduoWAHMACSecret: "", // not configured — sidecar absent in this deployment
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "pub2", IsPublic: true})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		if _, ok := spec.Env["JOTADUO_WA_URL"]; ok {
			t.Errorf("JOTADUO_WA_URL should NOT be set when secret is empty (no sidecar configured)")
		}
		if _, ok := spec.Env["JOTADUO_WA_HMAC_SECRET"]; ok {
			t.Errorf("JOTADUO_WA_HMAC_SECRET should NOT be set when secret is empty")
		}
	})

	t.Run("cliente tenant NEVER gets the envs even when secret is configured", func(t *testing.T) {
		p := &Provisioner{
			Cfg: &config.Config{
				GatewaySharedSecret: "gw",
				JotaduoWAURL:        "http://jotaduo-wa:18810",
				JotaduoWAHMACSecret: "wa-secret",
			},
		}
		spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "cli1", IsPublic: false})
		if err != nil {
			t.Fatalf("buildSpec: %v", err)
		}
		if _, ok := spec.Env["JOTADUO_WA_URL"]; ok {
			t.Errorf("cliente tenant got JOTADUO_WA_URL — promotion strip is broken")
		}
		if _, ok := spec.Env["JOTADUO_WA_HMAC_SECRET"]; ok {
			t.Errorf("cliente tenant got JOTADUO_WA_HMAC_SECRET — promotion strip is broken")
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
	spec, err := p.buildSpec(context.Background(), &store.Tenant{ID: "t1", WorkspaceID: &wsID})
	if err != nil {
		t.Fatalf("buildSpec: %v", err)
	}
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
