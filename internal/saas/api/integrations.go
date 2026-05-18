package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/mail"
	"net/url"
	"strconv"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/skills"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/pkg/credential"
)

type integrationView struct {
	SkillName     string                    `json:"skill_name"`
	Title         string                    `json:"title"`
	Description   string                    `json:"description,omitempty"`
	Active        bool                      `json:"active"`
	Configured    bool                      `json:"configured"`
	Status        string                    `json:"status"`
	MissingFields []string                  `json:"missing_fields,omitempty"`
	SchemaError   string                    `json:"schema_error,omitempty"`
	Fields        []skills.IntegrationField `json:"fields,omitempty"`
	Values        map[string]any            `json:"values"`
	Secrets       map[string]bool           `json:"secrets"`
}

type updateIntegrationReq struct {
	Values       map[string]any    `json:"values"`
	Secrets      map[string]string `json:"secrets"`
	ClearSecrets []string          `json:"clear_secrets"`
}

func (h *Handler) handleListIntegrations(w http.ResponseWriter, r *http.Request) {
	m, tenantID, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	views, _, err := h.buildIntegrationViews(r.Context(), tenantID, m)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"integrations": views})
}

func (h *Handler) handleGetIntegration(w http.ResponseWriter, r *http.Request) {
	m, tenantID, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	name, ok := skillNameParam(w, r)
	if !ok {
		return
	}
	views, _, err := h.buildIntegrationViews(r.Context(), tenantID, m)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, view := range views {
		if view.SkillName == name {
			writeJSON(w, http.StatusOK, view)
			return
		}
	}
	writeError(w, http.StatusNotFound, "integration not found")
}

func (h *Handler) handlePutIntegration(w http.ResponseWriter, r *http.Request) {
	m, tenantID, ok := h.skillsFor(w, r)
	if !ok {
		return
	}
	name, ok := skillNameParam(w, r)
	if !ok {
		return
	}

	skill, err := m.Get(name)
	if err != nil {
		if errors.Is(err, skills.ErrNotFound) {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !skill.Active || (skill.Integration == nil && skill.IntegrationSchemaError == "") {
		writeError(w, http.StatusNotFound, "integration not found")
		return
	}
	if skill.IntegrationSchemaError != "" {
		writeError(w, http.StatusBadRequest, "integration schema is invalid: "+skill.IntegrationSchemaError)
		return
	}
	if skill.Integration == nil {
		writeError(w, http.StatusNotFound, "integration not found")
		return
	}

	var req updateIntegrationReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	values := map[string]any{}
	secrets := map[string]string{}
	if h.Integrations != nil {
		existing, err := h.Integrations.Get(r.Context(), tenantID, name)
		if err != nil && !errors.Is(err, store.ErrSkillIntegrationNotFound) {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if existing != nil {
			values = decodeJSONObject(existing.ValuesJSON)
			secrets = decodeStringObject(existing.SecretsJSON)
		}
	}

	if req.Values != nil {
		values, err = cleanIntegrationValues(*skill.Integration, req.Values)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := applySecretChanges(*skill.Integration, secrets, req.Secrets, req.ClearSecrets); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	valuesJSON, _ := json.Marshal(values)
	secretsJSON, _ := json.Marshal(secrets)
	var updatedBy *int64
	if user, ok := userFromContext(r.Context()); ok {
		updatedBy = &user.ID
	}
	if h.Integrations != nil {
		_, err = h.Integrations.Upsert(r.Context(), &store.SkillIntegrationSettings{
			TenantID:    tenantID,
			SkillName:   name,
			ValuesJSON:  valuesJSON,
			SecretsJSON: secretsJSON,
			UpdatedBy:   updatedBy,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	views, manifest, err := h.buildIntegrationViews(r.Context(), tenantID, m)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := m.WriteIntegrationsManifest(manifest); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, view := range views {
		if view.SkillName == name {
			writeJSON(w, http.StatusOK, view)
			return
		}
	}
	writeError(w, http.StatusNotFound, "integration not found")
}

func (h *Handler) buildIntegrationViews(ctx context.Context, tenantID string, m *skills.Manager) ([]integrationView, []skills.IntegrationManifestItem, error) {
	summaries, err := m.List()
	if err != nil {
		return nil, nil, err
	}
	settingsBySkill := map[string]*store.SkillIntegrationSettings{}
	if h.Integrations != nil {
		settings, err := h.Integrations.ListForTenant(ctx, tenantID)
		if err != nil {
			return nil, nil, err
		}
		for _, item := range settings {
			settingsBySkill[item.SkillName] = item
		}
	}

	views := []integrationView{}
	manifest := []skills.IntegrationManifestItem{}
	for _, summary := range summaries {
		if !summary.Active {
			continue
		}
		if summary.Integration == nil && summary.IntegrationSchemaError == "" {
			continue
		}
		view := integrationView{
			SkillName: summary.Name,
			Title:     summary.Name,
			Active:    true,
			Status:    skills.IntegrationStatusSchemaInvalid,
			Values:    map[string]any{},
			Secrets:   map[string]bool{},
		}
		if summary.Integration != nil {
			view.Title = summary.Integration.Title
			view.Description = summary.Integration.Description
			view.Fields = summary.Integration.Fields
			view.Status = skills.IntegrationStatusPending
		} else if summary.Description != "" {
			view.Description = summary.Description
		}
		if summary.IntegrationSchemaError != "" {
			view.SchemaError = summary.IntegrationSchemaError
			views = append(views, view)
			manifest = append(manifest, skills.IntegrationManifestItem{
				SkillName:   view.SkillName,
				Title:       view.Title,
				Description: view.Description,
				Status:      view.Status,
				SchemaError: view.SchemaError,
			})
			continue
		}

		storedValues := map[string]any{}
		storedSecrets := map[string]string{}
		if setting := settingsBySkill[summary.Name]; setting != nil {
			storedValues = decodeJSONObject(setting.ValuesJSON)
			storedSecrets = decodeStringObject(setting.SecretsJSON)
		}
		for _, field := range summary.Integration.Fields {
			if field.Type == skills.FieldTypeSecret {
				view.Secrets[field.Key] = strings.TrimSpace(storedSecrets[field.Key]) != ""
				continue
			}
			if value, ok := storedValues[field.Key]; ok {
				view.Values[field.Key] = value
			}
		}
		view.MissingFields = skills.IntegrationMissingFields(*summary.Integration, view.Values, view.Secrets)
		view.Configured = len(view.MissingFields) == 0
		if view.Configured {
			view.Status = skills.IntegrationStatusConfigured
		}
		views = append(views, view)
		manifest = append(manifest, skills.IntegrationManifestItem{
			SkillName:         view.SkillName,
			Title:             view.Title,
			Description:       view.Description,
			Status:            view.Status,
			Fields:            view.Fields,
			Values:            view.Values,
			SecretsConfigured: view.Secrets,
			MissingFields:     view.MissingFields,
		})
	}
	return views, manifest, nil
}

func (h *Handler) syncTenantIntegrations(ctx context.Context, tenantID string) error {
	m := skills.New(h.Cfg.TenantHostDataDir, tenantID)
	_, manifest, err := h.buildIntegrationViews(ctx, tenantID, m)
	if err != nil {
		return err
	}
	return m.WriteIntegrationsManifest(manifest)
}

func decodeJSONObject(raw json.RawMessage) map[string]any {
	out := map[string]any{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		return map[string]any{}
	}
	return out
}

func decodeStringObject(raw json.RawMessage) map[string]string {
	out := map[string]string{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		return map[string]string{}
	}
	return out
}

func cleanIntegrationValues(schema skills.IntegrationSchema, input map[string]any) (map[string]any, error) {
	fields := map[string]skills.IntegrationField{}
	for _, field := range schema.Fields {
		if field.Type != skills.FieldTypeSecret {
			fields[field.Key] = field
		}
	}
	for key := range input {
		if _, ok := fields[key]; !ok {
			return nil, fmt.Errorf("unknown integration field %q", key)
		}
	}

	clean := map[string]any{}
	for _, field := range schema.Fields {
		if field.Type == skills.FieldTypeSecret {
			continue
		}
		raw, ok := input[field.Key]
		if !ok {
			continue
		}
		value, present, err := normalizeIntegrationValue(field, raw)
		if err != nil {
			return nil, err
		}
		if present {
			clean[field.Key] = value
		}
	}
	return clean, nil
}

func normalizeIntegrationValue(field skills.IntegrationField, raw any) (any, bool, error) {
	if raw == nil {
		return nil, false, nil
	}
	switch field.Type {
	case skills.FieldTypeText, skills.FieldTypeTextarea:
		value := strings.TrimSpace(fmt.Sprint(raw))
		if value == "" {
			return nil, false, nil
		}
		return value, true, nil
	case skills.FieldTypeURL:
		value := strings.TrimSpace(fmt.Sprint(raw))
		if value == "" {
			return nil, false, nil
		}
		parsed, err := url.Parse(value)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return nil, false, fmt.Errorf("%s must be a valid URL", field.Label)
		}
		return value, true, nil
	case skills.FieldTypeEmail:
		value := strings.TrimSpace(fmt.Sprint(raw))
		if value == "" {
			return nil, false, nil
		}
		if _, err := mail.ParseAddress(value); err != nil {
			return nil, false, fmt.Errorf("%s must be a valid email", field.Label)
		}
		return value, true, nil
	case skills.FieldTypeNumber:
		value, present, err := numberValue(raw)
		if err != nil {
			return nil, false, fmt.Errorf("%s must be a number", field.Label)
		}
		return value, present, nil
	case skills.FieldTypeBoolean:
		value, err := boolValue(raw)
		if err != nil {
			return nil, false, fmt.Errorf("%s must be true or false", field.Label)
		}
		return value, true, nil
	case skills.FieldTypeSelect:
		value := strings.TrimSpace(fmt.Sprint(raw))
		if value == "" {
			return nil, false, nil
		}
		if !optionAllowed(field, value) {
			return nil, false, fmt.Errorf("%s has an unsupported option", field.Label)
		}
		return value, true, nil
	case skills.FieldTypeMultiselect:
		values, err := stringSliceValue(raw)
		if err != nil {
			return nil, false, fmt.Errorf("%s must be a list", field.Label)
		}
		clean := []string{}
		seen := map[string]bool{}
		for _, value := range values {
			value = strings.TrimSpace(value)
			if value == "" || seen[value] {
				continue
			}
			if !optionAllowed(field, value) {
				return nil, false, fmt.Errorf("%s has an unsupported option", field.Label)
			}
			seen[value] = true
			clean = append(clean, value)
		}
		if len(clean) == 0 {
			return nil, false, nil
		}
		return clean, true, nil
	default:
		return nil, false, fmt.Errorf("%s has an unsupported field type", field.Label)
	}
}

func applySecretChanges(schema skills.IntegrationSchema, current map[string]string, updates map[string]string, clear []string) error {
	secretFields := map[string]bool{}
	for _, field := range schema.Fields {
		if field.Type == skills.FieldTypeSecret {
			secretFields[field.Key] = true
		}
	}
	for _, key := range clear {
		key = strings.TrimSpace(key)
		if !secretFields[key] {
			return fmt.Errorf("unknown secret field %q", key)
		}
		delete(current, key)
	}
	for key, plaintext := range updates {
		if !secretFields[key] {
			return fmt.Errorf("unknown secret field %q", key)
		}
		plaintext = strings.TrimSpace(plaintext)
		if plaintext == "" {
			continue
		}
		encrypted, err := credential.Encrypt(credential.PassphraseProvider(), "", plaintext)
		if err != nil {
			return fmt.Errorf(
				"secret encryption is not configured: set %s and %s (%v)",
				credential.PassphraseEnvVar,
				credential.SSHKeyPathEnvVar,
				err,
			)
		}
		current[key] = encrypted
	}
	return nil
}

func optionAllowed(field skills.IntegrationField, value string) bool {
	for _, option := range field.Options {
		if option.Value == value {
			return true
		}
	}
	return false
}

func numberValue(raw any) (float64, bool, error) {
	switch v := raw.(type) {
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, false, fmt.Errorf("invalid number")
		}
		return v, true, nil
	case float32:
		f := float64(v)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return 0, false, fmt.Errorf("invalid number")
		}
		return f, true, nil
	case int:
		return float64(v), true, nil
	case int64:
		return float64(v), true, nil
	case json.Number:
		f, err := v.Float64()
		return f, err == nil, err
	case string:
		v = strings.TrimSpace(v)
		if v == "" {
			return 0, false, nil
		}
		f, err := strconv.ParseFloat(v, 64)
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			return 0, false, fmt.Errorf("invalid number")
		}
		return f, true, nil
	default:
		return 0, false, fmt.Errorf("invalid number")
	}
}

func boolValue(raw any) (bool, error) {
	switch v := raw.(type) {
	case bool:
		return v, nil
	case string:
		return strconv.ParseBool(strings.TrimSpace(v))
	default:
		return false, fmt.Errorf("invalid boolean")
	}
}

func stringSliceValue(raw any) ([]string, error) {
	switch v := raw.(type) {
	case []string:
		return append([]string(nil), v...), nil
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, fmt.Sprint(item))
		}
		return out, nil
	default:
		return nil, fmt.Errorf("invalid list")
	}
}
