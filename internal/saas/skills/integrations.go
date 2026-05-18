package skills

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	IntegrationStatusConfigured    = "configured"
	IntegrationStatusPending       = "pending"
	IntegrationStatusSchemaInvalid = "schema_invalid"
)

const (
	FieldTypeText        = "text"
	FieldTypeTextarea    = "textarea"
	FieldTypeURL         = "url"
	FieldTypeEmail       = "email"
	FieldTypeNumber      = "number"
	FieldTypeBoolean     = "boolean"
	FieldTypeSelect      = "select"
	FieldTypeMultiselect = "multiselect"
	FieldTypeSecret      = "secret"
)

var validFieldKey = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

// IntegrationSchema is the SKILL.md metadata.integration contract exposed to
// the SaaS admin and materialized for the runtime.
type IntegrationSchema struct {
	Title       string             `json:"title" yaml:"title"`
	Description string             `json:"description,omitempty" yaml:"description"`
	Fields      []IntegrationField `json:"fields" yaml:"fields"`
}

type IntegrationField struct {
	Key         string                   `json:"key" yaml:"key"`
	Label       string                   `json:"label" yaml:"label"`
	Type        string                   `json:"type" yaml:"type"`
	Required    bool                     `json:"required,omitempty" yaml:"required"`
	Placeholder string                   `json:"placeholder,omitempty" yaml:"placeholder"`
	Help        string                   `json:"help,omitempty" yaml:"help"`
	Options     []IntegrationFieldOption `json:"options,omitempty" yaml:"options"`
}

type IntegrationFieldOption struct {
	Value string `json:"value" yaml:"value"`
	Label string `json:"label" yaml:"label"`
}

func (o *IntegrationFieldOption) UnmarshalYAML(value *yaml.Node) error {
	switch value.Kind {
	case yaml.ScalarNode:
		o.Value = strings.TrimSpace(value.Value)
		o.Label = o.Value
		return nil
	case yaml.MappingNode:
		var decoded struct {
			Value string `yaml:"value"`
			Label string `yaml:"label"`
		}
		if err := value.Decode(&decoded); err != nil {
			return err
		}
		o.Value = strings.TrimSpace(decoded.Value)
		o.Label = strings.TrimSpace(decoded.Label)
		if o.Label == "" {
			o.Label = o.Value
		}
		return nil
	default:
		return fmt.Errorf("option must be a string or {value,label} object")
	}
}

type IntegrationManifestItem struct {
	SkillName         string
	Title             string
	Description       string
	Status            string
	SchemaError       string
	Fields            []IntegrationField
	Values            map[string]any
	SecretsConfigured map[string]bool
	MissingFields     []string
}

func parseIntegrationSchema(raw any, skillName string) (*IntegrationSchema, string) {
	if raw == nil {
		return nil, ""
	}
	data, err := yaml.Marshal(raw)
	if err != nil {
		return nil, fmt.Sprintf("metadata.integration could not be parsed: %v", err)
	}
	var schema IntegrationSchema
	if err := yaml.Unmarshal(data, &schema); err != nil {
		return nil, fmt.Sprintf("metadata.integration is invalid YAML: %v", err)
	}
	if err := normalizeIntegrationSchema(&schema, skillName); err != nil {
		return nil, err.Error()
	}
	return &schema, ""
}

func normalizeIntegrationSchema(schema *IntegrationSchema, skillName string) error {
	schema.Title = strings.TrimSpace(schema.Title)
	if schema.Title == "" {
		schema.Title = skillName
	}
	schema.Description = strings.TrimSpace(schema.Description)
	if len(schema.Fields) == 0 {
		return fmt.Errorf("metadata.integration.fields must contain at least one field")
	}

	seen := map[string]bool{}
	for i := range schema.Fields {
		field := &schema.Fields[i]
		field.Key = strings.TrimSpace(field.Key)
		field.Label = strings.TrimSpace(field.Label)
		field.Type = strings.TrimSpace(field.Type)
		field.Placeholder = strings.TrimSpace(field.Placeholder)
		field.Help = strings.TrimSpace(field.Help)
		if field.Type == "" {
			field.Type = FieldTypeText
		}
		if field.Label == "" {
			field.Label = field.Key
		}
		if !validFieldKey.MatchString(field.Key) {
			return fmt.Errorf("metadata.integration.fields[%d].key must be lower snake_case", i)
		}
		if seen[field.Key] {
			return fmt.Errorf("metadata.integration.fields[%d].key duplicates %q", i, field.Key)
		}
		seen[field.Key] = true
		if !isSupportedFieldType(field.Type) {
			return fmt.Errorf("metadata.integration.fields[%d].type %q is not supported", i, field.Type)
		}
		for j := range field.Options {
			field.Options[j].Value = strings.TrimSpace(field.Options[j].Value)
			field.Options[j].Label = strings.TrimSpace(field.Options[j].Label)
			if field.Options[j].Label == "" {
				field.Options[j].Label = field.Options[j].Value
			}
			if field.Options[j].Value == "" {
				return fmt.Errorf("metadata.integration.fields[%d].options[%d].value is required", i, j)
			}
		}
		if (field.Type == FieldTypeSelect || field.Type == FieldTypeMultiselect) && len(field.Options) == 0 {
			return fmt.Errorf("metadata.integration.fields[%d].options is required for %s fields", i, field.Type)
		}
	}
	return nil
}

func isSupportedFieldType(kind string) bool {
	switch kind {
	case FieldTypeText, FieldTypeTextarea, FieldTypeURL, FieldTypeEmail,
		FieldTypeNumber, FieldTypeBoolean, FieldTypeSelect, FieldTypeMultiselect,
		FieldTypeSecret:
		return true
	default:
		return false
	}
}

func IntegrationMissingFields(schema IntegrationSchema, values map[string]any, secretsConfigured map[string]bool) []string {
	missing := []string{}
	for _, field := range schema.Fields {
		if !field.Required {
			continue
		}
		if field.Type == FieldTypeSecret {
			if !secretsConfigured[field.Key] {
				missing = append(missing, field.Key)
			}
			continue
		}
		if !integrationValuePresent(field, values[field.Key]) {
			missing = append(missing, field.Key)
		}
	}
	sort.Strings(missing)
	return missing
}

func integrationValuePresent(field IntegrationField, value any) bool {
	switch field.Type {
	case FieldTypeBoolean:
		_, ok := value.(bool)
		return ok
	case FieldTypeNumber:
		return value != nil
	case FieldTypeMultiselect:
		switch v := value.(type) {
		case []string:
			return len(v) > 0
		case []any:
			return len(v) > 0
		default:
			return false
		}
	default:
		s, ok := value.(string)
		return ok && strings.TrimSpace(s) != ""
	}
}

func (m *Manager) integrationsPath() string {
	return filepath.Join(m.WorkspaceDir, "INTEGRATIONS.md")
}

func (m *Manager) WriteIntegrationsManifest(items []IntegrationManifestItem) error {
	if len(items) == 0 {
		if err := os.Remove(m.integrationsPath()); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].SkillName < items[j].SkillName
	})

	var buf bytes.Buffer
	buf.WriteString("# Integrations\n\n")
	buf.WriteString("Generated from the SaaS integrations page. Secret values are never included here.\n\n")
	for _, item := range items {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			title = item.SkillName
		}
		status := item.Status
		if status == "" {
			status = IntegrationStatusPending
		}
		fmt.Fprintf(&buf, "## %s (`%s`)\n\n", title, item.SkillName)
		fmt.Fprintf(&buf, "Status: %s\n\n", status)
		if item.Description != "" {
			fmt.Fprintf(&buf, "%s\n\n", item.Description)
		}
		if item.SchemaError != "" {
			fmt.Fprintf(&buf, "Schema error: %s\n\n", item.SchemaError)
			continue
		}
		if len(item.MissingFields) > 0 {
			buf.WriteString("Missing required fields:\n")
			for _, key := range item.MissingFields {
				fmt.Fprintf(&buf, "- `%s`\n", key)
			}
			buf.WriteByte('\n')
		}
		if len(item.Fields) == 0 {
			continue
		}
		buf.WriteString("Fields:\n")
		for _, field := range item.Fields {
			if field.Type == FieldTypeSecret {
				state := "not configured"
				if item.SecretsConfigured[field.Key] {
					state = "configured secret"
				}
				fmt.Fprintf(&buf, "- %s (`%s`): %s\n", field.Label, field.Key, state)
				continue
			}
			value, ok := item.Values[field.Key]
			if !ok || !integrationValuePresent(field, value) {
				fmt.Fprintf(&buf, "- %s (`%s`): not configured\n", field.Label, field.Key)
				continue
			}
			fmt.Fprintf(&buf, "- %s (`%s`): %s\n", field.Label, field.Key, formatManifestValue(value))
		}
		buf.WriteByte('\n')
	}

	if err := os.MkdirAll(m.WorkspaceDir, 0o755); err != nil {
		return err
	}
	return writeFileAtomic(m.integrationsPath(), buf.Bytes(), 0o644)
}

func formatManifestValue(value any) string {
	switch v := value.(type) {
	case string:
		v = strings.TrimSpace(v)
		if v == "" {
			return "not configured"
		}
		return strings.ReplaceAll(v, "\n", `\n`)
	case bool:
		return strconv.FormatBool(v)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case []string:
		return strings.Join(v, ", ")
	default:
		if data, err := json.Marshal(v); err == nil {
			return string(data)
		}
		return fmt.Sprint(v)
	}
}
