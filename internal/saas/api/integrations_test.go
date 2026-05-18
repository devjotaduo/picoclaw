package api

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	saasconfig "github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/skills"
	"github.com/sipeed/picoclaw/pkg/credential"
)

func TestCleanIntegrationValuesValidatesAndNormalizes(t *testing.T) {
	schema := skills.IntegrationSchema{
		Fields: []skills.IntegrationField{
			{Key: "api_url", Label: "URL", Type: skills.FieldTypeURL},
			{Key: "retries", Label: "Retries", Type: skills.FieldTypeNumber},
			{Key: "enabled", Label: "Enabled", Type: skills.FieldTypeBoolean},
			{
				Key:   "channels",
				Label: "Channels",
				Type:  skills.FieldTypeMultiselect,
				Options: []skills.IntegrationFieldOption{
					{Value: "sms", Label: "SMS"},
					{Value: "email", Label: "Email"},
				},
			},
		},
	}
	clean, err := cleanIntegrationValues(schema, map[string]any{
		"api_url":  "https://api.example.com",
		"retries":  "3",
		"enabled":  "true",
		"channels": []any{"sms", "email", "sms"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if clean["api_url"] != "https://api.example.com" {
		t.Fatalf("api_url = %v", clean["api_url"])
	}
	if clean["enabled"] != true {
		t.Fatalf("enabled = %v", clean["enabled"])
	}
	if got := clean["channels"].([]string); len(got) != 2 || got[0] != "sms" || got[1] != "email" {
		t.Fatalf("channels = %#v", got)
	}

	if _, err := cleanIntegrationValues(schema, map[string]any{"unknown": true}); err == nil {
		t.Fatal("expected unknown field error")
	}
	if _, err := cleanIntegrationValues(schema, map[string]any{"api_url": "not-a-url"}); err == nil {
		t.Fatal("expected invalid URL error")
	}
}

func TestApplySecretChangesPreserveClearAndEncrypt(t *testing.T) {
	keyPath := filepath.Join(t.TempDir(), "picoclaw_ed25519.key")
	if err := credential.GenerateSSHKey(keyPath); err != nil {
		t.Fatal(err)
	}
	t.Setenv(credential.SSHKeyPathEnvVar, keyPath)
	oldProvider := credential.PassphraseProvider
	credential.PassphraseProvider = func() string { return "test-passphrase" }
	t.Cleanup(func() { credential.PassphraseProvider = oldProvider })

	schema := skills.IntegrationSchema{
		Fields: []skills.IntegrationField{
			{Key: "api_token", Label: "Token", Type: skills.FieldTypeSecret},
		},
	}
	current := map[string]string{"api_token": "enc://old"}
	if err := applySecretChanges(schema, current, nil, nil); err != nil {
		t.Fatal(err)
	}
	if current["api_token"] != "enc://old" {
		t.Fatal("secret should be preserved when omitted")
	}
	if err := applySecretChanges(schema, current, nil, []string{"api_token"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := current["api_token"]; ok {
		t.Fatal("secret should be cleared")
	}
	if err := applySecretChanges(schema, current, map[string]string{"api_token": "new-token"}, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(current["api_token"], credential.EncScheme) {
		t.Fatalf("secret should be encrypted, got %q", current["api_token"])
	}
	if strings.Contains(current["api_token"], "new-token") {
		t.Fatalf("encrypted secret leaked plaintext: %q", current["api_token"])
	}
}

func TestBuildIntegrationViewsIncludesOnlyActiveIntegrationSkills(t *testing.T) {
	root := t.TempDir()
	m := skills.New(root, "tenant-test")
	if err := os.MkdirAll(filepath.Join(m.WorkspaceDir, "skills", "agenda"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(m.WorkspaceDir, "skills", "plain"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(m.WorkspaceDir, "AGENT.md"), []byte(`---
name: pico
skills: [agenda, plain]
---
`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(m.WorkspaceDir, "skills", "agenda", "SKILL.md"), []byte(`---
name: agenda
metadata:
  integration:
    title: Agenda
    fields:
      - key: api_url
        label: URL
        type: url
        required: true
      - key: api_token
        label: Token
        type: secret
        required: true
---
`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(m.WorkspaceDir, "skills", "plain", "SKILL.md"), []byte(`---
name: plain
description: no integration
---
`), 0o644); err != nil {
		t.Fatal(err)
	}

	h := &Handler{Cfg: &saasconfig.Config{TenantHostDataDir: root}}
	views, manifest, err := h.buildIntegrationViews(context.Background(), "tenant-test", m)
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 {
		t.Fatalf("views = %+v", views)
	}
	if views[0].SkillName != "agenda" || views[0].Status != skills.IntegrationStatusPending {
		t.Fatalf("unexpected view: %+v", views[0])
	}
	if len(manifest) != 1 || manifest[0].SkillName != "agenda" {
		t.Fatalf("manifest = %+v", manifest)
	}
}
