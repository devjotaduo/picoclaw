package tenant

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestApplyTenantTestSetupSeedsWorkspaceConfigAndAgents(t *testing.T) {
	vol := writeTestModeFixture(t)

	setup := validTestSetup()
	setup.WhatsAppAllowlist.Groups = []string{"120363401234567890@g.us"}
	if err := ApplyTenantTestSetup(vol, setup); err != nil {
		t.Fatalf("ApplyTenantTestSetup: %v", err)
	}

	state := readConfigMap(t, filepath.Join(vol, "workspace", "state", "onboarding.json"))
	testingState := state["testing"].(map[string]any)
	if testingState["status"] != "in_test" {
		t.Fatalf("testing.status = %v, want in_test", testingState["status"])
	}
	owner := state["owner_captured"].(map[string]any)
	if owner["email"] != "bruno.teste5@jotaduo.com" {
		t.Fatalf("owner email = %v", owner["email"])
	}
	discovery := state["discovery"].(map[string]any)
	if got := stringSliceFromAny(discovery["agentes_recomendados"]); !reflect.DeepEqual(got, []string{"clara", "luna"}) {
		t.Fatalf("agentes_recomendados = %#v", got)
	}
	promotion := state["promotion"].(map[string]any)
	if got := stringSliceFromAny(promotion["blocked_by"]); !reflect.DeepEqual(got, []string{"test_mode_in_progress"}) {
		t.Fatalf("blocked_by = %#v", got)
	}

	empresa, err := os.ReadFile(filepath.Join(vol, "workspace", "memory", "empresa.md"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"Nome: Cafe Norte Teste5",
		"Segmento: restaurante",
		"Contato email: bruno.teste5@jotaduo.com",
		"Contato WhatsApp: 5587988553793",
	} {
		if !strings.Contains(string(empresa), want) {
			t.Fatalf("empresa.md missing %q:\n%s", want, empresa)
		}
	}
	if _, err := os.Stat(filepath.Join(vol, "workspace", "config", "company-profile.md")); err != nil {
		t.Fatalf("company-profile.md missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(vol, "workspace", "config", "authorized-channels.md")); err != nil {
		t.Fatalf("authorized-channels.md missing: %v", err)
	}

	cfg := readConfigMap(t, filepath.Join(vol, "config.json"))
	allowFrom := stringSliceFromAny(cfg["channel_list"].(map[string]any)["whatsapp"].(map[string]any)["allow_from"])
	if !reflect.DeepEqual(allowFrom, []string{"5587988553793@s.whatsapp.net", "120363401234567890@g.us"}) {
		t.Fatalf("allow_from = %#v", allowFrom)
	}
	for id, want := range map[string]bool{
		"main":      true,
		"admin":     true,
		"clara":     true,
		"luna":      true,
		"marcos":    false,
		"vendas":    false,
		"marketing": false,
	} {
		got, ok := panelEnabledFor(t, cfg, id)
		if !ok {
			t.Fatalf("agent %s not found", id)
		}
		if got != want {
			t.Fatalf("agent %s panel_enabled=%v, want %v", id, got, want)
		}
	}

	audit := readActivationAudit(t, vol)
	if audit.Source != "admin_test_setup" {
		t.Fatalf("audit source = %q", audit.Source)
	}
	if !reflect.DeepEqual(audit.ActiveAgents, []string{"clara", "luna", "main"}) {
		t.Fatalf("audit active agents = %#v", audit.ActiveAgents)
	}
}

func TestApplyTenantTestSetupRejectsInvalidInput(t *testing.T) {
	t.Run("invalid email", func(t *testing.T) {
		setup := validTestSetup()
		setup.Company.ContactEmail = "invalid"
		if err := ApplyTenantTestSetup(writeTestModeFixture(t), setup); err == nil {
			t.Fatal("expected invalid email error")
		}
	})

	t.Run("short whatsapp", func(t *testing.T) {
		setup := validTestSetup()
		setup.WhatsAppAllowlist.Phones = []string{"1234"}
		if err := ApplyTenantTestSetup(writeTestModeFixture(t), setup); err == nil {
			t.Fatal("expected short whatsapp error")
		}
	})

	t.Run("unknown agent", func(t *testing.T) {
		setup := validTestSetup()
		setup.SelectedAgents = []string{"clara", "inexistente"}
		if err := ApplyTenantTestSetup(writeTestModeFixture(t), setup); err == nil {
			t.Fatal("expected unknown agent error")
		}
	})
}

func TestFinishTestModeIsIdempotentAndKeepsWhatsAppAllowlist(t *testing.T) {
	vol := writeTestModeFixture(t)
	if err := ApplyTenantTestSetup(vol, validTestSetup()); err != nil {
		t.Fatalf("ApplyTenantTestSetup: %v", err)
	}

	status, err := FinishTestMode(vol, FinishTestModeInput{
		CompletedBy:              "tenant-owner",
		CompletedSource:          "owner",
		RequireWhatsAppAllowlist: true,
	})
	if err != nil {
		t.Fatalf("FinishTestMode: %v", err)
	}
	if status.InTest || status.Status != "production" {
		t.Fatalf("status after finish = %+v", status)
	}
	if status.ActiveProfile != string(UIProfileTenant) {
		t.Fatalf("active_profile = %q, want tenant", status.ActiveProfile)
	}
	if !reflect.DeepEqual(status.AllowFrom, []string{"5587988553793@s.whatsapp.net"}) {
		t.Fatalf("allow_from after finish = %#v", status.AllowFrom)
	}

	second, err := FinishTestMode(vol, FinishTestModeInput{
		CompletedBy:              "admin",
		CompletedSource:          "admin",
		RequireWhatsAppAllowlist: true,
	})
	if err != nil {
		t.Fatalf("second FinishTestMode: %v", err)
	}
	if second.CompletedSource != "owner" {
		t.Fatalf("second finish should preserve original completed_source, got %q", second.CompletedSource)
	}

	state := readConfigMap(t, filepath.Join(vol, "workspace", "state", "onboarding.json"))
	promotion := state["promotion"].(map[string]any)
	if got := stringSliceFromAny(promotion["blocked_by"]); len(got) != 0 {
		t.Fatalf("blocked_by after finish = %#v", got)
	}
}

func TestFinishTestModeRequiresWhatsAppAllowlistWhileInTest(t *testing.T) {
	vol := writeTestModeFixture(t)
	if err := os.Remove(filepath.Join(vol, "config.json")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(vol, "config.json"), []byte(`{"channel_list":{"whatsapp":{"type":"whatsapp_native","allow_from":[]}}}`), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(vol, "workspace", "state"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(vol, "workspace", "state", "onboarding.json"), []byte(`{"testing":{"status":"in_test"}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := FinishTestMode(vol, FinishTestModeInput{RequireWhatsAppAllowlist: true})
	if !errors.Is(err, ErrWhatsAppAllowlistRequired) {
		t.Fatalf("FinishTestMode err = %v, want ErrWhatsAppAllowlistRequired", err)
	}
}

func validTestSetup() TestSetup {
	return TestSetup{
		Company: TestCompanySeed{
			Name:            "Cafe Norte Teste5",
			Segment:         "restaurante",
			Summary:         "Resumo executivo validado pelo dono.",
			ContactEmail:    "bruno.teste5@jotaduo.com",
			ContactWhatsApp: "+55 87 98855-3793",
		},
		SelectedAgents: []string{"Clara", "Luna", "clara"},
		WhatsAppAllowlist: WhatsAppTestAllowlist{
			Phones: []string{"+55 87 98855-3793"},
		},
	}
}

func writeTestModeFixture(t *testing.T) string {
	t.Helper()
	vol := t.TempDir()
	if err := os.WriteFile(filepath.Join(vol, "ui-visibility.json"), []byte(`{
  "active_profile": "test",
  "profiles": {
    "test": {},
    "tenant": {}
  }
}`), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(vol, "config.json"), []byte(`{
  "channel_list": {
    "whatsapp": {
      "type": "whatsapp_native",
      "enabled": true
    }
  },
  "agents": {
    "list": [
      {"id": "main", "access": {"panel_enabled": true}},
      {"id": "admin", "access": {"panel_enabled": true}},
      {"id": "clara", "access": {"panel_enabled": true}},
      {"id": "luna", "access": {"panel_enabled": true}},
      {"id": "marcos", "access": {"panel_enabled": true}},
      {"id": "vendas", "access": {"panel_enabled": true}},
      {"id": "marketing", "access": {"panel_enabled": true}}
    ]
  }
}`), 0o640); err != nil {
		t.Fatal(err)
	}
	return vol
}
