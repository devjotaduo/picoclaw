package policy

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultRolePolicyRequestPermissions(t *testing.T) {
	rp := DefaultRolePolicy()

	tests := []struct {
		role   string
		method string
		path   string
		want   bool
	}{
		{RoleOperator, "POST", "/api/whatsapp/inbox/messages/send", true},
		{RoleOperator, "PUT", "/api/config", false},
		{RoleViewer, "GET", "/api/models", false},
		{RoleViewer, "GET", "/api/config", false},
		{RoleTenantAdmin, "PUT", "/api/models/0", true},
		{RoleTenantAdmin, "POST", "/api/agents", true},
		{RoleTenantAdmin, "POST", "/api/internal-agents/gerente/turn", true},
		{RoleTenantAdmin, "GET", "/api/agent/editor-state", true},
		{RoleTenantAdmin, "PUT", "/api/agent/templates/overrides/vendas", true},
		{RoleTenantAdmin, "GET", "/api/skills/weather/raw", true},
		{RoleTenantAdmin, "PUT", "/api/skills/weather", true},
		{RoleTenantAdmin, "GET", "/api/channels/whatsapp_native/config", true},
		{RoleOperator, "GET", "/api/internal-agents", false},
		{RoleViewer, "GET", "/api/internal-agents", false},
		{RoleViewer, "POST", "/api/agents", false},
		{RolePublic, "GET", "/pico/ws", true},
		{RolePublic, "POST", "/api/sessions", true},
		{RolePublic, "GET", "/api/gateway/status", true},
		{RolePublic, "PUT", "/api/config", false},
		{RolePublic, "POST", "/api/gateway/restart", false},
		{RolePlatformAdmin, "DELETE", "/api/models/0", true},
	}

	for _, tc := range tests {
		feature, required, known := FeatureForRequest(tc.method, tc.path)
		if !known {
			t.Fatalf("FeatureForRequest(%s %s) did not map a feature", tc.method, tc.path)
		}
		got := Allowed(tc.role, rp, feature, required)
		if got != tc.want {
			t.Fatalf("Allowed(%s, %s %s) = %v, want %v", tc.role, tc.method, tc.path, got, tc.want)
		}
	}
}

func TestNormalizeRolePolicyDerivesFineFeaturesFromLegacyGroups(t *testing.T) {
	rp := NormalizeRolePolicy(RolePolicy{
		RoleViewer: {
			FeatureTools:          AccessNone,
			FeatureAgentTemplates: AccessNone,
			FeatureSkills:         AccessNone,
			FeatureWhatsAppInbox:  AccessNone,
			FeatureChannels:       AccessNone,
		},
	})
	viewer := rp[RoleViewer]
	if viewer[FeatureAgentHub] != AccessNone {
		t.Fatalf("agent_hub = %q, want none inherited from tools", viewer[FeatureAgentHub])
	}
	if viewer[FeatureTemplateEditor] != AccessNone {
		t.Fatalf("template_editor = %q, want none inherited from agent_templates", viewer[FeatureTemplateEditor])
	}
	if viewer[FeatureSkillEditor] != AccessNone {
		t.Fatalf("skill_editor = %q, want none inherited from skills", viewer[FeatureSkillEditor])
	}
	if viewer[FeatureWhatsAppReports] != AccessNone {
		t.Fatalf("whatsapp_reports = %q, want none inherited from whatsapp_inbox", viewer[FeatureWhatsAppReports])
	}
	if viewer[ChannelFeature("whatsapp_native")] != AccessNone {
		t.Fatalf("channel:whatsapp_native = %q, want none inherited from channels", viewer[ChannelFeature("whatsapp_native")])
	}
}

func TestNormalizeRolePolicyPreservesExplicitFineFeatures(t *testing.T) {
	rp := NormalizeRolePolicy(RolePolicy{
		RoleViewer: {
			FeatureSkills:      AccessNone,
			FeatureSkillEditor: AccessRead,
		},
	})
	if got := rp[RoleViewer][FeatureSkillEditor]; got != AccessRead {
		t.Fatalf("skill_editor = %q, want explicit read", got)
	}
}

func TestLoadFileAcceptsLegacyRawRolePolicy(t *testing.T) {
	tmp := t.TempDir()
	raw := RolePolicy{
		RolePublic: {
			FeatureChat: AccessWrite,
			FeatureLogs: AccessRead,
		},
		RoleViewer: {
			FeatureChat: AccessNone,
		},
	}
	b, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("Marshal raw role policy: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "launcher_policy.json"), b, 0o644); err != nil {
		t.Fatalf("Write legacy launcher_policy.json: %v", err)
	}

	got, err := LoadFile(tmp)
	if err != nil {
		t.Fatalf("LoadFile legacy raw role policy: %v", err)
	}
	if got.RolePolicy[RolePublic][FeatureChat] != AccessWrite {
		t.Fatalf("public chat = %q, want write", got.RolePolicy[RolePublic][FeatureChat])
	}
	if got.RolePolicy[RolePublic][FeatureLogs] != AccessRead {
		t.Fatalf("public logs = %q, want read", got.RolePolicy[RolePublic][FeatureLogs])
	}
	if got.RolePolicy[RoleTenantOwner][FeatureModels] != AccessWrite {
		t.Fatalf("tenant owner models = %q, want write from defaults", got.RolePolicy[RoleTenantOwner][FeatureModels])
	}
}

func TestChannelCatalogReadAllowedBySpecificChannel(t *testing.T) {
	rp := NormalizeRolePolicy(RolePolicy{
		RoleViewer: {
			FeatureChannels:                   AccessNone,
			ChannelFeature("whatsapp_native"): AccessRead,
		},
	})
	feature, required, known := FeatureForRequest("GET", "/api/channels/catalog")
	if !known {
		t.Fatal("channels catalog should map to a policy feature")
	}
	if !Allowed(RoleViewer, rp, feature, required) {
		t.Fatal("specific readable channel should allow reading channel catalog")
	}
}

func TestFineFeatureForRequestMappings(t *testing.T) {
	tests := []struct {
		method string
		path   string
		want   string
		access Access
	}{
		{"GET", "/api/skills/search?q=github", FeatureAgentHub, AccessRead},
		{"POST", "/api/skills/install", FeatureAgentHub, AccessWrite},
		{"GET", "/api/tools", FeatureAgentHub, AccessRead},
		{"POST", "/api/tools/exec/state", FeatureTools, AccessWrite},
		{"GET", "/api/agent/templates/overrides", FeatureAgentTemplates, AccessRead},
		{"PUT", "/api/agent/templates/overrides/atendente", FeatureTemplateEditor, AccessWrite},
		{"GET", "/api/skills/weather/raw", FeatureSkillEditor, AccessRead},
		{"PUT", "/api/skills/weather", FeatureSkillEditor, AccessWrite},
		{"GET", "/api/whatsapp/reports", FeatureWhatsAppReports, AccessRead},
		{"GET", "/api/channels/telegram/config", ChannelFeature("telegram"), AccessRead},
	}

	for _, tc := range tests {
		got, access, known := FeatureForRequest(tc.method, tc.path)
		if !known {
			t.Fatalf("FeatureForRequest(%s %s) known=false", tc.method, tc.path)
		}
		if got != tc.want || access != tc.access {
			t.Fatalf("FeatureForRequest(%s %s) = %s/%s, want %s/%s", tc.method, tc.path, got, access, tc.want, tc.access)
		}
	}
}

func TestPolicyCatalogIncludesFineFeatures(t *testing.T) {
	catalog := PolicyCatalog()
	features := map[string]bool{}
	for _, feature := range catalog.Features {
		features[feature.ID] = true
	}
	for _, id := range []string{
		FeatureAgentHub,
		FeatureTemplateEditor,
		FeatureSkillEditor,
		FeatureWhatsAppReports,
		ChannelFeature("whatsapp_native"),
	} {
		if !features[id] {
			t.Fatalf("catalog missing feature %q", id)
		}
	}
	if len(catalog.DefaultRolePolicy[RoleTenantOwner]) == 0 {
		t.Fatal("catalog default role policy should be populated")
	}
}
