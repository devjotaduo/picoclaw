// Package skills reads and edits per-tenant skills under
// <host_data_dir>/<tenant_id>/workspace/skills/<name>/SKILL.md and the
// matching workspace AGENT.md template that lists which skills the
// agent has enabled.
package skills

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var (
	ErrNotFound      = errors.New("skill not found")
	ErrInvalidName   = errors.New("invalid skill name")
	ErrAlreadyExists = errors.New("skill already exists")
)

// validName allows lowercase kebab-case (matches the existing skills on disk).
var validName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// Manager scopes all skill operations to a single tenant's workspace.
type Manager struct {
	WorkspaceDir string // .../tenants/<id>/workspace
}

// New returns a Manager pinned to the given host data dir + tenant id.
// It does not touch the filesystem.
func New(hostDataDir, tenantID string) *Manager {
	return &Manager{
		WorkspaceDir: filepath.Join(hostDataDir, tenantID, "workspace"),
	}
}

func (m *Manager) skillsDir() string  { return filepath.Join(m.WorkspaceDir, "skills") }
func (m *Manager) agentPath() string  { return filepath.Join(m.WorkspaceDir, "AGENT.md") }
func (m *Manager) legacyPath() string { return filepath.Join(m.WorkspaceDir, "AGENTS.md") }

// AgentTemplate is the editable representation of the workspace agent prompt.
type AgentTemplate struct {
	Path    string `json:"path"`
	Source  string `json:"source"`  // "AGENT.md" or "AGENTS.md" (legacy) or "AGENT.md" (new, empty file)
	Content string `json:"content"` // full file content, frontmatter + body
	Exists  bool   `json:"exists"`  // false when no file is on disk yet
}

// GetAgent returns the current AGENT.md (or legacy AGENTS.md). If neither
// exists, it returns an empty template pointing at the canonical AGENT.md path
// so the caller can save into it.
func (m *Manager) GetAgent() (AgentTemplate, error) {
	if raw, err := os.ReadFile(m.agentPath()); err == nil {
		return AgentTemplate{
			Path:    m.agentPath(),
			Source:  "AGENT.md",
			Content: string(raw),
			Exists:  true,
		}, nil
	} else if !os.IsNotExist(err) {
		return AgentTemplate{}, err
	}
	if raw, err := os.ReadFile(m.legacyPath()); err == nil {
		return AgentTemplate{
			Path:    m.legacyPath(),
			Source:  "AGENTS.md",
			Content: string(raw),
			Exists:  true,
		}, nil
	} else if !os.IsNotExist(err) {
		return AgentTemplate{}, err
	}
	return AgentTemplate{
		Path:   m.agentPath(),
		Source: "AGENT.md",
		Exists: false,
	}, nil
}

// AgentInfo is the structured frontmatter of AGENT.md as a friendly form
// shape. Only the fields exposed to the admin UI live here; unknown frontmatter
// keys are preserved on save.
type AgentInfo struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Model       string   `json:"model,omitempty"`
	MaxTurns    *int     `json:"max_turns,omitempty"`
	Tools       []string `json:"tools,omitempty"`
	Skills      []string `json:"skills,omitempty"`
	MCPServers  []string `json:"mcp_servers,omitempty"`
}

// GetAgentInfo parses the AGENT.md frontmatter into a typed struct.
// Returns the zero value when AGENT.md doesn't exist on disk yet.
func (m *Manager) GetAgentInfo() (AgentInfo, error) {
	a, err := m.GetAgent()
	if err != nil {
		return AgentInfo{}, err
	}
	if !a.Exists {
		return AgentInfo{}, nil
	}
	fm, _, err := splitFrontmatter([]byte(a.Content))
	if err != nil || len(fm) == 0 {
		return AgentInfo{}, nil
	}
	// We unmarshal into a temporary map to keep YAML key flexibility (camelCase
	// vs snake_case across editors), then read out known fields.
	var raw map[string]any
	if err := yaml.Unmarshal(fm, &raw); err != nil {
		return AgentInfo{}, fmt.Errorf("AGENT.md frontmatter is not valid YAML: %w", err)
	}
	info := AgentInfo{}
	if v, ok := raw["name"].(string); ok {
		info.Name = v
	}
	if v, ok := raw["description"].(string); ok {
		info.Description = v
	}
	if v, ok := raw["model"].(string); ok {
		info.Model = v
	}
	if v, ok := raw["maxTurns"].(int); ok {
		info.MaxTurns = &v
	} else if v, ok := raw["max_turns"].(int); ok {
		info.MaxTurns = &v
	}
	info.Tools = toStringSlice(raw["tools"])
	info.Skills = toStringSlice(raw["skills"])
	if mc := toStringSlice(raw["mcpServers"]); mc != nil {
		info.MCPServers = mc
	} else {
		info.MCPServers = toStringSlice(raw["mcp_servers"])
	}
	return info, nil
}

// SetAgentInfo merges the supplied fields into AGENT.md's frontmatter and
// rewrites the file. Unknown frontmatter keys and the body are preserved.
// String fields are written when non-empty; pass empty string to clear them
// only for description (other identity fields require a non-empty value).
func (m *Manager) SetAgentInfo(in AgentInfo) error {
	a, err := m.GetAgent()
	if err != nil {
		return err
	}
	body := []byte{}
	var raw map[string]any
	if a.Exists {
		fm, b, err := splitFrontmatter([]byte(a.Content))
		if err == nil {
			body = b
			if len(fm) > 0 {
				if err := yaml.Unmarshal(fm, &raw); err != nil {
					return fmt.Errorf("AGENT.md frontmatter is not valid YAML: %w", err)
				}
			}
		}
	}
	if raw == nil {
		raw = map[string]any{}
	}

	if in.Name != "" {
		raw["name"] = in.Name
	}
	// Description we always set — empty string clears it.
	raw["description"] = in.Description
	if in.Model != "" {
		raw["model"] = in.Model
	} else {
		delete(raw, "model")
	}
	if in.MaxTurns != nil {
		raw["maxTurns"] = *in.MaxTurns
	} else {
		delete(raw, "maxTurns")
		delete(raw, "max_turns")
	}
	setListOrDelete(raw, "tools", in.Tools)
	setListOrDelete(raw, "skills", in.Skills)
	if _, hasSnake := raw["mcp_servers"]; hasSnake {
		setListOrDelete(raw, "mcp_servers", in.MCPServers)
	} else {
		setListOrDelete(raw, "mcpServers", in.MCPServers)
	}

	out, err := yaml.Marshal(raw)
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	buf.WriteString("---\n")
	buf.Write(out)
	buf.WriteString("---\n")
	buf.Write(body)
	if err := os.MkdirAll(m.WorkspaceDir, 0o755); err != nil {
		return err
	}
	return writeFileAtomic(m.agentPath(), buf.Bytes(), 0o644)
}

func setListOrDelete(m map[string]any, key string, list []string) {
	if len(list) == 0 {
		delete(m, key)
		return
	}
	// Sort for stable output. AgentInfo is order-insensitive in practice.
	sorted := append([]string(nil), list...)
	sort.Strings(sorted)
	m[key] = sorted
}

// SaveAgent writes the AGENT.md template. Validates that the YAML frontmatter
// (if present) parses, so a bad save doesn't silently break the agent loader.
func (m *Manager) SaveAgent(content string) error {
	fm, _, err := splitFrontmatter([]byte(content))
	if err != nil {
		return err
	}
	if len(fm) > 0 {
		var probe map[string]any
		if err := yaml.Unmarshal(fm, &probe); err != nil {
			return fmt.Errorf("AGENT.md frontmatter is not valid YAML: %w", err)
		}
	}
	if err := os.MkdirAll(m.WorkspaceDir, 0o755); err != nil {
		return err
	}
	return writeFileAtomic(m.agentPath(), []byte(content), 0o644)
}

// ValidateName rejects path-escaping or otherwise unexpected skill names.
func ValidateName(name string) error {
	if !validName.MatchString(name) {
		return ErrInvalidName
	}
	return nil
}

// SkillSummary is the lightweight row returned by List.
type SkillSummary struct {
	Name                   string             `json:"name"`
	Description            string             `json:"description"`
	Emoji                  string             `json:"emoji,omitempty"`
	Active                 bool               `json:"active"`  // present in AGENT.md `skills:` list
	Visible                bool               `json:"visible"` // metadata.visible — defaults to true
	Integration            *IntegrationSchema `json:"integration,omitempty"`
	IntegrationSchemaError string             `json:"integration_schema_error,omitempty"`
}

// Skill is the full payload returned by Get.
type Skill struct {
	SkillSummary
	Content string `json:"content"` // full SKILL.md, frontmatter + body
}

// List enumerates every skill folder and joins it with the AGENT.md active set.
func (m *Manager) List() ([]SkillSummary, error) {
	entries, err := os.ReadDir(m.skillsDir())
	if err != nil {
		if os.IsNotExist(err) {
			return []SkillSummary{}, nil
		}
		return nil, err
	}
	active, err := m.readAgentSkills()
	if err != nil {
		return nil, err
	}
	activeSet := map[string]bool{}
	for _, n := range active {
		activeSet[n] = true
	}
	out := make([]SkillSummary, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if ValidateName(name) != nil {
			continue
		}
		s, err := m.summarize(name)
		if err != nil {
			continue
		}
		s.Active = activeSet[name]
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// Get returns full SKILL.md content + metadata.
func (m *Manager) Get(name string) (Skill, error) {
	if err := ValidateName(name); err != nil {
		return Skill{}, err
	}
	raw, err := os.ReadFile(m.skillFilePath(name))
	if err != nil {
		if os.IsNotExist(err) {
			return Skill{}, ErrNotFound
		}
		return Skill{}, err
	}
	summary, _ := summarizeContent(name, raw)
	active, err := m.readAgentSkills()
	if err != nil {
		return Skill{}, err
	}
	for _, a := range active {
		if a == name {
			summary.Active = true
			break
		}
	}
	return Skill{SkillSummary: summary, Content: string(raw)}, nil
}

// Save writes the full SKILL.md content. Used by the markdown editor.
// Creates the skill directory if missing.
func (m *Manager) Save(name, content string) error {
	if err := ValidateName(name); err != nil {
		return err
	}
	dir := filepath.Join(m.skillsDir(), name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(dir, "SKILL.md"), []byte(content), 0o644)
}

// Create makes a new skill folder with a minimal SKILL.md template.
func (m *Manager) Create(name, description string) error {
	if err := ValidateName(name); err != nil {
		return err
	}
	dir := filepath.Join(m.skillsDir(), name)
	if _, err := os.Stat(dir); err == nil {
		return ErrAlreadyExists
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if description == "" {
		description = "Describe what this skill does in one short sentence."
	}
	template := fmt.Sprintf(`---
name: %s
description: %s
metadata: {"visible": true}
---

# %s

Describe how the agent should use this skill.
`, name, yamlEscape(description), name)
	return writeFileAtomic(filepath.Join(dir, "SKILL.md"), []byte(template), 0o644)
}

// Delete removes the skill folder entirely and also drops it from AGENT.md.
func (m *Manager) Delete(name string) error {
	if err := ValidateName(name); err != nil {
		return err
	}
	dir := filepath.Join(m.skillsDir(), name)
	if _, err := os.Stat(dir); err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return m.SetActive(name, false)
}

// SetVisible writes metadata.visible inside the SKILL.md frontmatter.
func (m *Manager) SetVisible(name string, visible bool) error {
	if err := ValidateName(name); err != nil {
		return err
	}
	path := m.skillFilePath(name)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	updated, err := setVisibleInFrontmatter(raw, visible)
	if err != nil {
		return err
	}
	return writeFileAtomic(path, updated, 0o644)
}

// SetActive adds or removes the skill from AGENT.md's skills: list.
func (m *Manager) SetActive(name string, active bool) error {
	if err := ValidateName(name); err != nil {
		return err
	}
	raw, err := os.ReadFile(m.agentPath())
	if err != nil {
		if os.IsNotExist(err) {
			if !active {
				return nil
			}
			// Create a minimal AGENT.md so the activation is durable.
			raw = []byte("---\nname: pico\ndescription: workspace assistant\n---\n")
		} else {
			return err
		}
	}
	updated, err := setAgentSkill(raw, name, active)
	if err != nil {
		return err
	}
	return writeFileAtomic(m.agentPath(), updated, 0o644)
}

func (m *Manager) skillFilePath(name string) string {
	return filepath.Join(m.skillsDir(), name, "SKILL.md")
}

func (m *Manager) summarize(name string) (SkillSummary, error) {
	raw, err := os.ReadFile(m.skillFilePath(name))
	if err != nil {
		return SkillSummary{}, err
	}
	return summarizeContent(name, raw)
}

func (m *Manager) readAgentSkills() ([]string, error) {
	raw, err := os.ReadFile(m.agentPath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	fm, _, err := splitFrontmatter(raw)
	if err != nil || len(fm) == 0 {
		return nil, nil
	}
	var doc struct {
		Skills []string `yaml:"skills"`
	}
	if err := yaml.Unmarshal(fm, &doc); err != nil {
		return nil, nil
	}
	return doc.Skills, nil
}

// ---- frontmatter helpers ---------------------------------------------------

var fmDelim = []byte("---")

// splitFrontmatter returns (yaml-bytes, body-bytes, error). When no
// frontmatter is present, yaml is nil and body == raw.
func splitFrontmatter(raw []byte) ([]byte, []byte, error) {
	trimmed := bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF})
	if !bytes.HasPrefix(trimmed, fmDelim) {
		return nil, raw, nil
	}
	rest := trimmed[len(fmDelim):]
	// require a newline after the opening ---
	nl := bytes.IndexByte(rest, '\n')
	if nl == -1 {
		return nil, raw, nil
	}
	rest = rest[nl+1:]
	end := bytes.Index(rest, append([]byte("\n"), fmDelim...))
	if end == -1 {
		return nil, raw, nil
	}
	yamlPart := rest[:end]
	body := rest[end+1+len(fmDelim):]
	// skip the newline that follows the closing ---
	if len(body) > 0 && body[0] == '\n' {
		body = body[1:]
	} else if len(body) > 1 && body[0] == '\r' && body[1] == '\n' {
		body = body[2:]
	}
	return yamlPart, body, nil
}

func summarizeContent(name string, raw []byte) (SkillSummary, error) {
	s := SkillSummary{Name: name, Visible: true}
	fm, _, err := splitFrontmatter(raw)
	if err != nil || len(fm) == 0 {
		return s, nil
	}
	var doc struct {
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
		Metadata    any    `yaml:"metadata"`
	}
	if err := yaml.Unmarshal(fm, &doc); err != nil {
		return s, nil
	}
	if doc.Name != "" {
		s.Name = doc.Name
	}
	s.Description = strings.TrimSpace(doc.Description)
	visible, emoji, integration, integrationErr := readMetadata(doc.Metadata, s.Name)
	if visible != nil {
		s.Visible = *visible
	}
	s.Emoji = emoji
	s.Integration = integration
	s.IntegrationSchemaError = integrationErr
	return s, nil
}

// readMetadata accepts the two SKILL.md conventions seen in the wild:
//   - metadata: {"visible": true, "nanobot": {"emoji": "🌤"}}
//   - metadata as a nested mapping
//
// It returns the visible flag (nil = unset), nanobot emoji, and optional
// integration schema declared for the skill.
func readMetadata(meta any, skillName string) (*bool, string, *IntegrationSchema, string) {
	if meta == nil {
		return nil, "", nil, ""
	}
	asMap, ok := meta.(map[string]any)
	if !ok {
		return nil, "", nil, ""
	}
	var visible *bool
	if v, ok := asMap["visible"].(bool); ok {
		visible = &v
	}
	emoji := ""
	if nb, ok := asMap["nanobot"].(map[string]any); ok {
		if e, ok := nb["emoji"].(string); ok {
			emoji = e
		}
	}
	integration, integrationErr := parseIntegrationSchema(asMap["integration"], skillName)
	return visible, emoji, integration, integrationErr
}

// setVisibleInFrontmatter rewrites just the metadata.visible field, preserving
// the rest of the file (body included). The frontmatter is re-emitted by
// yaml.v3 — we accept some whitespace reflow inside the YAML block.
func setVisibleInFrontmatter(raw []byte, visible bool) ([]byte, error) {
	fm, body, err := splitFrontmatter(raw)
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if len(fm) > 0 {
		if err := yaml.Unmarshal(fm, &doc); err != nil {
			return nil, fmt.Errorf("frontmatter is not valid YAML: %w", err)
		}
	}
	if doc == nil {
		doc = map[string]any{}
	}
	meta, _ := doc["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	meta["visible"] = visible
	doc["metadata"] = meta

	out, err := yaml.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	buf.WriteString("---\n")
	buf.Write(out)
	buf.WriteString("---\n")
	buf.Write(body)
	return buf.Bytes(), nil
}

// setAgentSkill adds or removes name from AGENT.md's `skills:` array.
// We deserialize, mutate, and re-emit the frontmatter via yaml.v3. The body
// is preserved byte-for-byte.
func setAgentSkill(raw []byte, name string, active bool) ([]byte, error) {
	fm, body, err := splitFrontmatter(raw)
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if len(fm) > 0 {
		if err := yaml.Unmarshal(fm, &doc); err != nil {
			return nil, fmt.Errorf("AGENT.md frontmatter is not valid YAML: %w", err)
		}
	}
	if doc == nil {
		doc = map[string]any{}
	}
	current := toStringSlice(doc["skills"])
	updated := make([]string, 0, len(current)+1)
	found := false
	for _, s := range current {
		if s == name {
			found = true
			if active {
				updated = append(updated, s)
			}
			continue
		}
		updated = append(updated, s)
	}
	if active && !found {
		updated = append(updated, name)
		sort.Strings(updated)
	}
	if len(updated) == 0 {
		delete(doc, "skills")
	} else {
		doc["skills"] = updated
	}

	out, err := yaml.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	buf.WriteString("---\n")
	buf.Write(out)
	buf.WriteString("---\n")
	buf.Write(body)
	return buf.Bytes(), nil
}

func toStringSlice(v any) []string {
	switch x := v.(type) {
	case []string:
		return x
	case []any:
		out := make([]string, 0, len(x))
		for _, item := range x {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func yamlEscape(s string) string {
	// crude — wrap in double quotes and escape any embedded ones.
	if strings.ContainsAny(s, "\":#&*!|>%@`") || strings.Contains(s, ": ") {
		return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
	}
	return s
}

func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".skill-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, path)
}
