package skills

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const weatherSkill = `---
name: weather
description: Get weather data.
metadata: {"nanobot":{"emoji":"🌤️","requires":{"bins":["curl"]}}}
---

# Weather

Body here.
`

const agentMD = `---
name: pico
description: workspace agent
---

You are Pico.
`

func newTestManager(t *testing.T) *Manager {
	t.Helper()
	root := t.TempDir()
	m := New(root, "tenant-test")
	if err := os.MkdirAll(filepath.Join(m.skillsDir(), "weather"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(m.skillFilePath("weather"), []byte(weatherSkill), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(m.agentPath(), []byte(agentMD), 0o644); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestList_ParsesFrontmatter(t *testing.T) {
	m := newTestManager(t)
	list, err := m.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("want 1 skill, got %d", len(list))
	}
	s := list[0]
	if s.Name != "weather" {
		t.Errorf("name = %q", s.Name)
	}
	if s.Emoji != "🌤️" {
		t.Errorf("emoji = %q", s.Emoji)
	}
	if !s.Visible {
		t.Errorf("default visible should be true")
	}
	if s.Active {
		t.Errorf("active should be false initially")
	}
}

func TestList_ParsesIntegrationSchema(t *testing.T) {
	m := newTestManager(t)
	if err := os.MkdirAll(filepath.Join(m.skillsDir(), "agenda"), 0o755); err != nil {
		t.Fatal(err)
	}
	const content = `---
name: agenda
description: Agenda integration.
metadata:
  integration:
    title: Agenda
    description: Dados usados pela agenda.
    fields:
      - key: api_url
        label: URL da API
        type: url
        required: true
      - key: api_token
        label: Token
        type: secret
        required: true
      - key: mode
        label: Modo
        type: select
        options:
          - value: sandbox
            label: Sandbox
          - production
---

# Agenda
`
	if err := os.WriteFile(m.skillFilePath("agenda"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	list, err := m.List()
	if err != nil {
		t.Fatal(err)
	}
	var agenda SkillSummary
	for _, item := range list {
		if item.Name == "agenda" {
			agenda = item
			break
		}
	}
	if agenda.Integration == nil {
		t.Fatalf("expected integration schema, got %+v", agenda)
	}
	if agenda.Integration.Title != "Agenda" {
		t.Fatalf("title = %q", agenda.Integration.Title)
	}
	if got := agenda.Integration.Fields[2].Options[1].Value; got != "production" {
		t.Fatalf("string option value = %q", got)
	}
}

func TestList_ReportsInvalidIntegrationSchema(t *testing.T) {
	m := newTestManager(t)
	if err := os.MkdirAll(filepath.Join(m.skillsDir(), "broken"), 0o755); err != nil {
		t.Fatal(err)
	}
	const content = `---
name: broken
metadata:
  integration:
    fields:
      - key: ApiURL
        label: URL
        type: mystery
---

# Broken
`
	if err := os.WriteFile(m.skillFilePath("broken"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	list, err := m.List()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range list {
		if item.Name == "broken" {
			if item.Integration != nil {
				t.Fatalf("invalid schema should not decode: %+v", item.Integration)
			}
			if item.IntegrationSchemaError == "" {
				t.Fatal("expected integration schema error")
			}
			return
		}
	}
	t.Fatal("broken skill not found")
}

func TestWriteIntegrationsManifest_RedactsSecrets(t *testing.T) {
	m := newTestManager(t)
	err := m.WriteIntegrationsManifest([]IntegrationManifestItem{
		{
			SkillName:   "agenda",
			Title:       "Agenda",
			Description: "Dados usados pela agenda.",
			Status:      IntegrationStatusConfigured,
			Fields: []IntegrationField{
				{Key: "api_url", Label: "URL da API", Type: FieldTypeURL, Required: true},
				{Key: "api_token", Label: "Token", Type: FieldTypeSecret, Required: true},
			},
			Values:            map[string]any{"api_url": "https://api.example.com"},
			SecretsConfigured: map[string]bool{"api_token": true},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(m.integrationsPath())
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "https://api.example.com") {
		t.Fatalf("manifest missing non-secret value:\n%s", text)
	}
	if !strings.Contains(text, "configured secret") {
		t.Fatalf("manifest missing secret configured marker:\n%s", text)
	}
	if strings.Contains(text, "api-token-123") {
		t.Fatalf("manifest leaked secret:\n%s", text)
	}
}

func TestSetActive_AddsAndRemoves(t *testing.T) {
	m := newTestManager(t)
	if err := m.SetActive("weather", true); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(m.agentPath())
	if !strings.Contains(string(raw), "skills:") {
		t.Fatalf("AGENT.md missing skills key after activate:\n%s", raw)
	}
	if !strings.Contains(string(raw), "weather") {
		t.Fatalf("AGENT.md missing weather after activate:\n%s", raw)
	}
	// body preserved
	if !strings.Contains(string(raw), "You are Pico.") {
		t.Fatalf("AGENT.md body lost:\n%s", raw)
	}

	list, _ := m.List()
	if !list[0].Active {
		t.Fatal("List should report active=true after activation")
	}

	if err := m.SetActive("weather", false); err != nil {
		t.Fatal(err)
	}
	raw, _ = os.ReadFile(m.agentPath())
	if strings.Contains(string(raw), "weather") {
		t.Fatalf("AGENT.md still contains weather after deactivate:\n%s", raw)
	}
}

func TestSetVisible_TogglesMetadata(t *testing.T) {
	m := newTestManager(t)
	if err := m.SetVisible("weather", false); err != nil {
		t.Fatal(err)
	}
	s, err := m.Get("weather")
	if err != nil {
		t.Fatal(err)
	}
	if s.Visible {
		t.Errorf("visible should be false")
	}
	// body kept
	if !strings.Contains(s.Content, "Body here.") {
		t.Errorf("body lost:\n%s", s.Content)
	}
	// nanobot.emoji preserved
	if s.Emoji != "🌤️" {
		t.Errorf("emoji lost after SetVisible, got %q", s.Emoji)
	}
}

func TestGetSaveAgent(t *testing.T) {
	m := newTestManager(t)
	a, err := m.GetAgent()
	if err != nil {
		t.Fatal(err)
	}
	if !a.Exists || a.Source != "AGENT.md" {
		t.Fatalf("expected existing AGENT.md, got %+v", a)
	}
	updated := strings.Replace(a.Content, "workspace agent", "edited", 1)
	if err := m.SaveAgent(updated); err != nil {
		t.Fatal(err)
	}
	a2, _ := m.GetAgent()
	if !strings.Contains(a2.Content, "edited") {
		t.Errorf("save round-trip failed:\n%s", a2.Content)
	}

	if err := m.SaveAgent("---\nthis: is\nnot: valid: yaml\n---\n"); err == nil {
		t.Error("expected SaveAgent to reject invalid YAML frontmatter")
	}

	// fresh workspace with no AGENT.md
	root := t.TempDir()
	mb := New(root, "tenant-empty")
	_ = os.MkdirAll(mb.WorkspaceDir, 0o755)
	a3, err := mb.GetAgent()
	if err != nil {
		t.Fatal(err)
	}
	if a3.Exists {
		t.Error("expected Exists=false on empty workspace")
	}
}

func TestAgentInfo_RoundTrip(t *testing.T) {
	m := newTestManager(t)
	// Add a frontmatter that exercises every supported field.
	custom := `---
name: pico
description: A helpful assistant.
model: claude-sonnet-4-5
maxTurns: 30
tools: [web, exec]
skills: [weather]
mcpServers: [filesystem]
extra_key: preserved
---

Body unchanged here.
`
	_ = os.WriteFile(m.agentPath(), []byte(custom), 0o644)

	info, err := m.GetAgentInfo()
	if err != nil {
		t.Fatal(err)
	}
	if info.Name != "pico" || info.Description != "A helpful assistant." {
		t.Errorf("bad parse: %+v", info)
	}
	if info.Model != "claude-sonnet-4-5" {
		t.Errorf("model = %q", info.Model)
	}
	if info.MaxTurns == nil || *info.MaxTurns != 30 {
		t.Errorf("maxTurns = %v", info.MaxTurns)
	}
	if len(info.Skills) != 1 || info.Skills[0] != "weather" {
		t.Errorf("skills = %v", info.Skills)
	}

	// Mutate and write back.
	info.Description = "Edited."
	info.Model = "gpt-4o"
	mt := 10
	info.MaxTurns = &mt
	info.Skills = []string{"weather", "github"}
	if err := m.SetAgentInfo(info); err != nil {
		t.Fatal(err)
	}

	raw, _ := os.ReadFile(m.agentPath())
	if !strings.Contains(string(raw), "Edited.") {
		t.Errorf("description not written:\n%s", raw)
	}
	if !strings.Contains(string(raw), "gpt-4o") {
		t.Errorf("model not written:\n%s", raw)
	}
	if !strings.Contains(string(raw), "Body unchanged here.") {
		t.Errorf("body lost:\n%s", raw)
	}
	if !strings.Contains(string(raw), "extra_key: preserved") {
		t.Errorf("unknown frontmatter keys must be preserved:\n%s", raw)
	}
	// Skills sorted
	if !strings.Contains(string(raw), "github") || !strings.Contains(string(raw), "weather") {
		t.Errorf("skills missing:\n%s", raw)
	}

	// Clearing maxTurns by passing nil should drop the key.
	info.MaxTurns = nil
	info.Model = ""
	_ = m.SetAgentInfo(info)
	raw, _ = os.ReadFile(m.agentPath())
	if strings.Contains(string(raw), "maxTurns:") {
		t.Errorf("maxTurns should be removed:\n%s", raw)
	}
	if strings.Contains(string(raw), "model:") {
		t.Errorf("model should be removed:\n%s", raw)
	}
}

func TestCreateAndDelete(t *testing.T) {
	root := t.TempDir()
	m := New(root, "tenant-test")
	if err := m.Create("hello-world", "Says hello."); err != nil {
		t.Fatal(err)
	}
	s, err := m.Get("hello-world")
	if err != nil {
		t.Fatal(err)
	}
	if s.Description != "Says hello." {
		t.Errorf("description = %q", s.Description)
	}
	if !s.Visible {
		t.Errorf("default visible should be true")
	}
	if err := m.Create("hello-world", ""); err != ErrAlreadyExists {
		t.Errorf("want ErrAlreadyExists, got %v", err)
	}
	if err := ValidateName("../escape"); err == nil {
		t.Error("ValidateName should reject path traversal")
	}
	// activate then delete should drop it from AGENT.md too
	_ = os.WriteFile(m.agentPath(), []byte(agentMD), 0o644)
	if err := m.SetActive("hello-world", true); err != nil {
		t.Fatal(err)
	}
	if err := m.Delete("hello-world"); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(m.agentPath())
	if strings.Contains(string(raw), "hello-world") {
		t.Errorf("AGENT.md still references deleted skill:\n%s", raw)
	}
}
