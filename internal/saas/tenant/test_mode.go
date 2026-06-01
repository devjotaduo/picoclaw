package tenant

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type TestCompanySeed struct {
	Name            string `json:"name,omitempty"`
	Segment         string `json:"segment,omitempty"`
	Summary         string `json:"summary,omitempty"`
	ContactEmail    string `json:"contact_email,omitempty"`
	ContactWhatsApp string `json:"contact_whatsapp,omitempty"`
	Products        string `json:"products_services,omitempty"`
	BusinessHours   string `json:"business_hours,omitempty"`
	Address         string `json:"address,omitempty"`
	ServiceRegions  string `json:"service_regions,omitempty"`
	Site            string `json:"site,omitempty"`
	Instagram       string `json:"instagram,omitempty"`
}

type WhatsAppTestAllowlist struct {
	Phones []string `json:"phones,omitempty"`
	Groups []string `json:"groups,omitempty"`
}

type TestSetup struct {
	Company           TestCompanySeed       `json:"company_seed,omitempty"`
	SelectedAgents    []string              `json:"selected_agents,omitempty"`
	WhatsAppAllowlist WhatsAppTestAllowlist `json:"whatsapp_test_allowlist,omitempty"`
}

type FinishTestModeInput struct {
	CompletedBy              string
	CompletedSource          string
	RequireWhatsAppAllowlist bool
}

type TestModeStatus struct {
	Status          string   `json:"status"`
	InTest          bool     `json:"in_test"`
	CompletedAt     string   `json:"completed_at,omitempty"`
	CompletedBy     string   `json:"completed_by,omitempty"`
	CompletedSource string   `json:"completed_source,omitempty"`
	ActiveProfile   string   `json:"active_profile"`
	AllowFrom       []string `json:"allow_from"`
	CanFinish       bool     `json:"can_finish"`
	BlockedBy       []string `json:"blocked_by"`
}

var (
	testModeEmailRE              = regexp.MustCompile(`^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$`)
	ErrWhatsAppAllowlistRequired = errors.New("whatsapp allowlist is required while tenant is in test mode")
)

func NormalizeTestSetup(setup TestSetup) (TestSetup, error) {
	setup.Company.Name = strings.TrimSpace(setup.Company.Name)
	setup.Company.Segment = strings.TrimSpace(setup.Company.Segment)
	setup.Company.Summary = strings.TrimSpace(setup.Company.Summary)
	setup.Company.ContactEmail = strings.TrimSpace(strings.ToLower(setup.Company.ContactEmail))
	setup.Company.ContactWhatsApp = strings.TrimSpace(setup.Company.ContactWhatsApp)
	setup.Company.Products = strings.TrimSpace(setup.Company.Products)
	setup.Company.BusinessHours = strings.TrimSpace(setup.Company.BusinessHours)
	setup.Company.Address = strings.TrimSpace(setup.Company.Address)
	setup.Company.ServiceRegions = strings.TrimSpace(setup.Company.ServiceRegions)
	setup.Company.Site = strings.TrimSpace(setup.Company.Site)
	setup.Company.Instagram = strings.TrimSpace(setup.Company.Instagram)

	if setup.Company.Name == "" {
		return TestSetup{}, errors.New("company_seed.name is required for setup_mode=test")
	}
	if setup.Company.Segment == "" {
		return TestSetup{}, errors.New("company_seed.segment is required for setup_mode=test")
	}
	if setup.Company.Summary == "" {
		return TestSetup{}, errors.New("company_seed.summary is required for setup_mode=test")
	}
	if setup.Company.ContactEmail == "" || !testModeEmailRE.MatchString(setup.Company.ContactEmail) {
		return TestSetup{}, fmt.Errorf("company_seed.contact_email is invalid: %q", setup.Company.ContactEmail)
	}
	if setup.Company.ContactWhatsApp != "" {
		jid, err := normalizeWhatsAppPhoneJID(setup.Company.ContactWhatsApp)
		if err != nil {
			return TestSetup{}, fmt.Errorf("company_seed.contact_whatsapp: %w", err)
		}
		setup.Company.ContactWhatsApp = displayPhoneFromJID(jid)
	}

	selected := normalizeAgentSelectionIDs(setup.SelectedAgents)
	if len(selected) == 0 {
		return TestSetup{}, errors.New("selected_agents must include at least one agent for setup_mode=test")
	}
	setup.SelectedAgents = selected

	allowFrom, err := NormalizeWhatsAppAllowFrom(setup.WhatsAppAllowlist)
	if err != nil {
		return TestSetup{}, err
	}
	if len(allowFrom) == 0 {
		return TestSetup{}, ErrWhatsAppAllowlistRequired
	}
	if setup.Company.ContactWhatsApp == "" {
		setup.Company.ContactWhatsApp = displayPhoneFromJID(allowFrom[0])
	}
	return setup, nil
}

func NormalizeWhatsAppAllowFrom(input WhatsAppTestAllowlist) ([]string, error) {
	var out []string
	seen := map[string]bool{}
	add := func(value string) {
		if value == "" || seen[value] {
			return
		}
		seen[value] = true
		out = append(out, value)
	}
	for _, raw := range input.Phones {
		jid, err := normalizeWhatsAppPhoneJID(raw)
		if err != nil {
			return nil, fmt.Errorf("whatsapp_test_allowlist.phones: %w", err)
		}
		add(jid)
	}
	for _, raw := range input.Groups {
		jid, err := normalizeWhatsAppGroupJID(raw)
		if err != nil {
			return nil, fmt.Errorf("whatsapp_test_allowlist.groups: %w", err)
		}
		add(jid)
	}
	return out, nil
}

func ApplyTenantTestSetup(volumePath string, setup TestSetup) error {
	if strings.TrimSpace(volumePath) == "" {
		return errors.New("volume path is required")
	}
	normalized, err := NormalizeTestSetup(setup)
	if err != nil {
		return err
	}
	allowFrom, _ := NormalizeWhatsAppAllowFrom(normalized.WhatsAppAllowlist)
	if err := validateSelectedAgentsExist(volumePath, normalized.SelectedAgents); err != nil {
		return err
	}

	if err := writeTestEmpresaMemory(volumePath, normalized.Company, normalized.SelectedAgents); err != nil {
		return err
	}
	if err := writeTestCompanyProfile(volumePath, normalized.Company, allowFrom); err != nil {
		return err
	}
	if err := writeTestOnboardingState(volumePath, normalized.Company, normalized.SelectedAgents); err != nil {
		return err
	}
	if err := patchWhatsAppAllowFrom(volumePath, allowFrom); err != nil {
		return err
	}
	if _, _, err := applySelectedAgentsToConfig(volumePath, normalized.SelectedAgents); err != nil {
		return err
	}
	return nil
}

func ReadTestModeStatus(volumePath string) (TestModeStatus, error) {
	activeProfile := ReadUIVisibilityActiveProfile(volumePath)
	allowFrom, err := readWhatsAppAllowFrom(volumePath)
	if err != nil {
		return TestModeStatus{}, err
	}
	state, err := readOnboardingJSONMap(volumePath)
	if err != nil {
		return TestModeStatus{}, err
	}
	testing := mapValue(state["testing"])
	status := stringValue(testing["status"])
	if status == "" {
		status = "not_configured"
	}
	completedAt := stringValue(testing["completed_at"])
	blocked := []string{}
	inTest := status == "in_test" || (activeProfile == string(UIProfileTest) && completedAt == "")
	if inTest && len(allowFrom) == 0 {
		blocked = append(blocked, "whatsapp_allowlist_empty")
	}
	return TestModeStatus{
		Status:          status,
		InTest:          inTest,
		CompletedAt:     completedAt,
		CompletedBy:     stringValue(testing["completed_by"]),
		CompletedSource: stringValue(testing["completed_source"]),
		ActiveProfile:   activeProfile,
		AllowFrom:       allowFrom,
		CanFinish:       inTest && len(blocked) == 0,
		BlockedBy:       blocked,
	}, nil
}

func FinishTestMode(volumePath string, input FinishTestModeInput) (TestModeStatus, error) {
	status, err := ReadTestModeStatus(volumePath)
	if err != nil {
		return TestModeStatus{}, err
	}
	if status.InTest && input.RequireWhatsAppAllowlist && len(status.AllowFrom) == 0 {
		return status, ErrWhatsAppAllowlistRequired
	}

	state, err := readOnboardingJSONMap(volumePath)
	if err != nil {
		return TestModeStatus{}, err
	}
	testing := mapValue(state["testing"])
	if testing == nil {
		testing = map[string]any{}
	}
	now := nowRFC3339()
	if stringValue(testing["started_at"]) == "" {
		testing["started_at"] = now
	}
	alreadyCompleted := stringValue(testing["completed_at"]) != ""
	if !alreadyCompleted {
		testing["completed_at"] = now
		testing["completed_by"] = defaultString(strings.TrimSpace(input.CompletedBy), "system")
		testing["completed_source"] = defaultString(strings.TrimSpace(input.CompletedSource), "system")
	}
	testing["status"] = "production"
	state["schema_version"] = 5
	state["testing"] = testing

	promotion := mapValue(state["promotion"])
	if promotion == nil {
		promotion = map[string]any{}
	}
	promotion["blocked_by"] = removeStringFromAnySlice(promotion["blocked_by"], "test_mode_in_progress")
	state["promotion"] = promotion

	if err := writeOnboardingJSONMap(volumePath, state); err != nil {
		return TestModeStatus{}, err
	}
	if err := SetUIVisibilityActiveProfile(volumePath, UIProfileTenant); err != nil {
		return TestModeStatus{}, err
	}
	return ReadTestModeStatus(volumePath)
}

func ReadUIVisibilityActiveProfile(volumePath string) string {
	raw, err := os.ReadFile(filepath.Join(volumePath, "ui-visibility.json"))
	if err != nil {
		return ""
	}
	var doc struct {
		ActiveProfile string `json:"active_profile"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return ""
	}
	return strings.TrimSpace(doc.ActiveProfile)
}

func normalizeAgentSelectionIDs(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, raw := range values {
		id := strings.ToLower(strings.TrimSpace(raw))
		if id == "" {
			continue
		}
		id = strings.ReplaceAll(id, " ", "-")
		if alias := recommendedAgentAliases[id]; alias != "" {
			id = alias
		}
		switch id {
		case "pico-web", "pico_web", "rafael-assistente", "rafael-assistente-interno":
			id = "main"
		}
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func normalizeWhatsAppPhoneJID(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", errors.New("empty phone")
	}
	if strings.Contains(value, "@") {
		if strings.HasSuffix(strings.ToLower(value), "@s.whatsapp.net") {
			user, _, _ := strings.Cut(value, "@")
			digits := regexp.MustCompile(`\D+`).ReplaceAllString(user, "")
			if len(digits) < 10 || len(digits) > 15 {
				return "", fmt.Errorf("%q must have 10-15 digits", raw)
			}
			return digits + "@s.whatsapp.net", nil
		}
		return "", fmt.Errorf("%q is not a WhatsApp phone JID", raw)
	}
	digits := regexp.MustCompile(`\D+`).ReplaceAllString(value, "")
	if len(digits) < 10 || len(digits) > 15 {
		return "", fmt.Errorf("%q must have 10-15 digits", raw)
	}
	return digits + "@s.whatsapp.net", nil
}

func normalizeWhatsAppGroupJID(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	value = strings.TrimPrefix(value, "group:")
	if value == "" {
		return "", errors.New("empty group")
	}
	user, _, _ := strings.Cut(value, "@")
	digits := regexp.MustCompile(`\D+`).ReplaceAllString(user, "")
	if len(digits) < 10 {
		return "", fmt.Errorf("%q must include a numeric WhatsApp group id", raw)
	}
	return digits + "@g.us", nil
}

func displayPhoneFromJID(jid string) string {
	user, _, _ := strings.Cut(jid, "@")
	digits := regexp.MustCompile(`\D+`).ReplaceAllString(user, "")
	if digits == "" {
		return jid
	}
	return digits
}

func writeTestEmpresaMemory(volumePath string, company TestCompanySeed, selectedAgents []string) error {
	path := filepath.Join(volumePath, "workspace", "memory", "empresa.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir memory: %w", err)
	}
	lines := []string{
		"# Empresa",
		"",
		"Status: em teste com dados iniciais do admin",
		"Nome: " + company.Name,
		"Segmento: " + company.Segment,
		"Contato email: " + company.ContactEmail,
		"Contato WhatsApp: " + company.ContactWhatsApp,
		"",
		"## Resumo",
		company.Summary,
		"",
		"## Produtos ou serviços",
		bulletOrPending(company.Products),
		"",
		"## Horário",
		bulletOrPending(company.BusinessHours),
		"",
		"## Regiões atendidas",
		bulletOrPending(firstNonEmpty(company.ServiceRegions, company.Address)),
		"",
		"## Quando chamar humano",
		"- quando houver dúvida, exceção, preço não confirmado ou pedido fora das regras cadastradas",
		"",
		"## Informações que nunca podem ser inventadas",
		"- preço, prazo, disponibilidade, diagnóstico, garantia ou política não cadastrada",
		"",
		"## Informações proibidas de falar",
		"- credenciais, dados internos, margem, informações pessoais ou políticas privadas",
		"",
		"Segmento detectado: " + company.Segment,
		"Status da informação: em teste",
		"",
		"## Agentes selecionados para teste",
	}
	for _, id := range selectedAgents {
		lines = append(lines, "- "+id)
	}
	content := strings.Join(lines, "\n") + "\n"
	return writeFileAtomic(path, []byte(content), 0o644)
}

func writeTestCompanyProfile(volumePath string, company TestCompanySeed, allowFrom []string) error {
	configDir := filepath.Join(volumePath, "workspace", "config")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return fmt.Errorf("mkdir workspace/config: %w", err)
	}
	profileLines := []string{
		"# Perfil da empresa",
		"",
		"Nome da empresa: " + company.Name,
		"Segmento: " + company.Segment,
		"Descrição curta: " + company.Summary,
		"Produtos ou serviços: " + pendingIfEmpty(company.Products),
		"Horário de funcionamento: " + pendingIfEmpty(company.BusinessHours),
		"Endereço: " + pendingIfEmpty(company.Address),
		"Regiões atendidas: " + pendingIfEmpty(company.ServiceRegions),
		"Site: " + pendingIfEmpty(company.Site),
		"Instagram: " + pendingIfEmpty(company.Instagram),
		"WhatsApp: " + company.ContactWhatsApp,
		"Pode informar preço: Somente faixa aprovada",
		"Faixa de preço: pendente de validação",
		"Formas de pagamento: pendente de validação",
		"Quando chamar humano: quando houver dúvida, exceção, preço não confirmado ou pedido fora das regras cadastradas",
		"Informações que o agente nunca pode errar: preço, prazo, disponibilidade, diagnóstico, garantia ou política não cadastrada",
		"Informações proibidas de falar: credenciais, dados internos, margem, informações pessoais ou políticas privadas",
		"Status da informação: em teste",
	}
	if err := writeFileAtomic(filepath.Join(configDir, "company-profile.md"), []byte(strings.Join(profileLines, "\n")+"\n"), 0o644); err != nil {
		return err
	}

	channelLines := []string{"# Canais autorizados", "", "Canais oficiais: WhatsApp nativo", "Canais autorizados:"}
	for _, jid := range allowFrom {
		channelLines = append(channelLines, "- "+jid)
	}
	return writeFileAtomic(filepath.Join(configDir, "authorized-channels.md"), []byte(strings.Join(channelLines, "\n")+"\n"), 0o644)
}

func writeTestOnboardingState(volumePath string, company TestCompanySeed, selectedAgents []string) error {
	state, err := readOnboardingJSONMap(volumePath)
	if err != nil {
		return err
	}
	now := nowRFC3339()
	if len(state) == 0 {
		state = map[string]any{}
	}
	state["schema_version"] = 5
	state["phase"] = defaultString(stringValue(state["phase"]), "discovery_done")
	state["discovery"] = map[string]any{
		"started_at":             now,
		"completed_at":           now,
		"segment":                company.Segment,
		"summary":                company.Summary,
		"agentes_recomendados":   selectedAgents,
		"selected_agents_source": "admin_test_setup",
		"agent":                  "pico_web",
	}
	state["deepening"] = map[string]any{
		"started_at":             nil,
		"first_contact_at":       nil,
		"last_outreach_at":       nil,
		"last_owner_response_at": nil,
		"last_bridge_attempt_at": nil,
		"last_bridge_failed_at":  nil,
		"last_bridge_error":      nil,
		"areas_covered":          []string{},
		"areas_required":         []string{"equipe", "casos-excecao", "faq", "historico", "regras-tacitas"},
		"completed_at":           nil,
		"agent":                  "catarina",
	}
	state["owner_captured"] = map[string]any{
		"name":        company.Name,
		"email":       company.ContactEmail,
		"whatsapp":    company.ContactWhatsApp,
		"captured_by": "admin_test_setup",
		"captured_at": now,
	}
	state["promotion"] = map[string]any{
		"ready":       false,
		"blocked_by":  []string{"test_mode_in_progress"},
		"promoted_at": nil,
		"promoted_by": nil,
	}
	state["testing"] = map[string]any{
		"status":             "in_test",
		"started_at":         now,
		"completed_at":       nil,
		"completed_by":       nil,
		"completed_source":   nil,
		"allowlist_required": true,
	}
	state["audit"] = map[string]any{
		"events": []map[string]any{{
			"at":    now,
			"stage": "test_setup_created",
			"actor": "admin",
		}},
	}
	return writeOnboardingJSONMap(volumePath, state)
}

func patchWhatsAppAllowFrom(volumePath string, allowFrom []string) error {
	if len(allowFrom) == 0 {
		return nil
	}
	cfgPath := filepath.Join(volumePath, "config.json")
	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("parse config.json: %w", err)
	}
	channels := mapValue(cfg["channel_list"])
	if channels == nil {
		channels = map[string]any{}
		cfg["channel_list"] = channels
	}
	wa := mapValue(channels["whatsapp"])
	if wa == nil {
		wa = map[string]any{
			"type":    "whatsapp_native",
			"enabled": true,
		}
		channels["whatsapp"] = wa
	}
	wa["allow_from"] = allowFrom
	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	out = append(out, '\n')
	return writeFileAtomic(cfgPath, out, 0o600)
}

func readWhatsAppAllowFrom(volumePath string) ([]string, error) {
	cfgPath := filepath.Join(volumePath, "config.json")
	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config.json: %w", err)
	}
	channels := mapValue(cfg["channel_list"])
	if channels == nil {
		return []string{}, nil
	}
	wa := mapValue(channels["whatsapp"])
	return stringSliceFromAny(wa["allow_from"]), nil
}

func validateSelectedAgentsExist(volumePath string, selected []string) error {
	cfgPath := filepath.Join(volumePath, "config.json")
	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("parse config.json: %w", err)
	}
	agents := mapValue(cfg["agents"])
	if agents == nil {
		return errors.New("config.json agents section is missing")
	}
	list, _ := agents["list"].([]any)
	if len(list) == 0 {
		return errors.New("config.json agents.list is empty")
	}
	known := map[string]bool{}
	for _, rawAgent := range list {
		agent := mapValue(rawAgent)
		id := strings.ToLower(strings.TrimSpace(stringValue(agent["id"])))
		if id != "" {
			known[id] = true
		}
	}
	for _, id := range selected {
		if id == "main" || id == "admin" {
			continue
		}
		if !known[id] {
			return fmt.Errorf("selected agent %q does not exist in config.json agents.list", id)
		}
	}
	return nil
}

func applySelectedAgentsToConfig(volumePath string, selected []string) ([]string, []string, error) {
	cfgPath := filepath.Join(volumePath, "config.json")
	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		return nil, nil, fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, nil, fmt.Errorf("parse config.json: %w", err)
	}
	agents := mapValue(cfg["agents"])
	if agents == nil {
		return nil, nil, errors.New("config.json agents section is missing")
	}
	list, _ := agents["list"].([]any)
	if len(list) == 0 {
		return nil, nil, errors.New("config.json agents.list is empty")
	}
	selectedSet := map[string]bool{}
	for _, id := range selected {
		selectedSet[id] = true
	}
	known := map[string]bool{}
	for _, rawAgent := range list {
		agent := mapValue(rawAgent)
		id := strings.ToLower(strings.TrimSpace(stringValue(agent["id"])))
		if id != "" {
			known[id] = true
		}
	}
	for _, id := range selected {
		if id == "main" || id == "admin" {
			continue
		}
		if !known[id] {
			return nil, nil, fmt.Errorf("selected agent %q does not exist in config.json agents.list", id)
		}
	}

	active := map[string]bool{"main": true}
	hidden := map[string]bool{}
	changed := false
	for _, rawAgent := range list {
		agent := mapValue(rawAgent)
		id := strings.ToLower(strings.TrimSpace(stringValue(agent["id"])))
		if id == "" || id == "main" || id == "admin" {
			continue
		}
		access := mapValue(agent["access"])
		if access == nil {
			access = map[string]any{}
			agent["access"] = access
			changed = true
		}
		want := selectedSet[id]
		if want {
			active[id] = true
		} else {
			hidden[id] = true
		}
		if got, ok := access["panel_enabled"].(bool); !ok || got != want {
			access["panel_enabled"] = want
			changed = true
		}
	}
	activeIDs := sortedBoolKeys(active)
	hiddenIDs := sortedBoolKeys(hidden)
	if changed {
		out, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return nil, nil, fmt.Errorf("marshal config.json: %w", err)
		}
		out = append(out, '\n')
		if err := writeFileAtomic(cfgPath, out, 0o600); err != nil {
			return nil, nil, fmt.Errorf("write config.json: %w", err)
		}
	}
	audit := RecommendedAgentsActivationResult{
		Applied:      changed,
		ActiveAgents: activeIDs,
		HiddenAgents: hiddenIDs,
		Source:       "admin_test_setup",
		NeedsReload:  changed,
	}
	if err := writeRecommendedAgentsAudit(volumePath, audit); err != nil {
		return nil, nil, err
	}
	return activeIDs, hiddenIDs, nil
}

func readOnboardingJSONMap(volumePath string) (map[string]any, error) {
	path := filepath.Join(volumePath, "workspace", "state", "onboarding.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]any{}, nil
		}
		return nil, fmt.Errorf("read onboarding.json: %w", err)
	}
	var state map[string]any
	if err := json.Unmarshal(raw, &state); err != nil {
		return nil, fmt.Errorf("parse onboarding.json: %w", err)
	}
	return state, nil
}

func writeOnboardingJSONMap(volumePath string, state map[string]any) error {
	path := filepath.Join(volumePath, "workspace", "state", "onboarding.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir workspace/state: %w", err)
	}
	out, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal onboarding.json: %w", err)
	}
	out = append(out, '\n')
	return writeFileAtomic(path, out, 0o644)
}

func mapValue(value any) map[string]any {
	if value == nil {
		return nil
	}
	m, _ := value.(map[string]any)
	return m
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func stringSliceFromAny(value any) []string {
	switch v := value.(type) {
	case nil:
		return []string{}
	case []string:
		return append([]string(nil), v...)
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if text := stringValue(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	case string:
		if strings.TrimSpace(v) == "" {
			return []string{}
		}
		return []string{strings.TrimSpace(v)}
	default:
		return []string{fmt.Sprint(v)}
	}
}

func removeStringFromAnySlice(value any, remove string) []string {
	in := stringSliceFromAny(value)
	out := make([]string, 0, len(in))
	for _, item := range in {
		if item != remove && item != "" {
			out = append(out, item)
		}
	}
	return out
}

func sortedBoolKeys(values map[string]bool) []string {
	out := make([]string, 0, len(values))
	for key := range values {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func pendingIfEmpty(value string) string {
	if strings.TrimSpace(value) == "" {
		return "pendente de validação"
	}
	return strings.TrimSpace(value)
}

func bulletOrPending(value string) string {
	if strings.TrimSpace(value) == "" {
		return "- pendente de validação"
	}
	lines := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(strings.TrimPrefix(line, "-"))
		if line != "" {
			out = append(out, "- "+line)
		}
	}
	if len(out) == 0 {
		return "- pendente de validação"
	}
	return strings.Join(out, "\n")
}
