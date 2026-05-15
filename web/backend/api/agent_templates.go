package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"text/template"

	"github.com/sipeed/picoclaw/pkg/config"
)

// agentTemplateApplyRequest is the payload sent by the frontend templates page.
// It carries the (already customized) parameters the user picked in the drawer.
type agentTemplateApplyRequest struct {
	TemplateID   string                   `json:"template_id"`
	Name         string                   `json:"name"`
	Presentation string                   `json:"presentation"`
	Personality  []string                 `json:"personality"`
	Values       []string                 `json:"values"`
	Functions    []string                 `json:"functions"`
	Prohibitions []string                 `json:"prohibitions"`
	Protections  []string                 `json:"protections"`
	CompanyInfo  agentTemplateCompanyInfo `json:"company_info"`
	Language     string                   `json:"language"`
	Tone         string                   `json:"tone"`
	Skills       []string                 `json:"skills"`
	Model        string                   `json:"model,omitempty"`

	ConversationFlow         []string                       `json:"conversation_flow,omitempty"`
	RequiredFieldsByIntent   map[string][]string            `json:"required_fields_by_intent,omitempty"`
	ResponseExamples         agentTemplateResponseExamples  `json:"response_examples"`
	StyleGuide               agentTemplateStyleGuide        `json:"style_guide"`
	FallbackPolicy           agentTemplateFallbackPolicy    `json:"fallback_policy"`
	HandoffSummaryTemplate   map[string]any                 `json:"handoff_summary_template,omitempty"`
	StructuredOutputTemplate map[string]any                 `json:"structured_output_template,omitempty"`
	PriorityRules            agentTemplatePriorityRules     `json:"priority_rules"`
	KnowledgePolicy          []string                       `json:"knowledge_policy,omitempty"`
	SecurityRules            []string                       `json:"security_rules,omitempty"`
	QualityMetrics           []string                       `json:"quality_metrics,omitempty"`

	Modules       agentTemplateModules        `json:"modules"`
	Professionals []agentTemplateProfessional `json:"professionals,omitempty"`
	Products      []agentTemplateProduct      `json:"products,omitempty"`

	RecommendedTools     []string `json:"recommended_tools,omitempty"`
	ToolNamespaces       []string `json:"tool_namespaces,omitempty"`
	RequiredIntegrations []string `json:"required_integrations,omitempty"`
	PermissionLevel      string   `json:"permission_level,omitempty"`
	ApprovalRequiredFor  []string `json:"approval_required_for,omitempty"`

	Behavior agentTemplateBehavior `json:"behavior"`
}

// agentTemplateBehavior carries the runtime behavioral toggles persisted as
// behavior.json in the workspace. Filters here are enforced by the channel and
// agent layers (hard drops, not prompt instructions), so the LLM never sees
// content that a toggle rejected.
type agentTemplateBehavior struct {
	// Activation + where to respond
	MasterEnabled     bool   `json:"master_enabled"`
	BusinessHoursOnly bool   `json:"business_hours_only"`
	OutOfHoursReply   string `json:"out_of_hours_reply,omitempty"`
	RespondInDM       bool   `json:"respond_in_dm"`
	RespondInGroups   bool   `json:"respond_in_groups"`
	GroupMentionOnly  bool   `json:"group_mention_only"`
	KeywordTrigger    string `json:"keyword_trigger,omitempty"`

	// Outbound-only / who can talk to the agent
	OutboundOnlyMode        bool `json:"outbound_only_mode"`
	IgnoreOtherBots         bool `json:"ignore_other_bots"`
	IgnoreForwardedMessages bool `json:"ignore_forwarded_messages"`
	IgnoreSelfMessages      bool `json:"ignore_self_messages"`

	// Media gating (hard filter — strip before LLM sees it)
	ProcessImages    bool `json:"process_images"`
	ProcessDocuments bool `json:"process_documents"`
	ProcessAudio     bool `json:"process_audio"`
	ProcessVideo     bool `json:"process_video"`
	ProcessStickers  bool `json:"process_stickers"`
	ProcessLocation  bool `json:"process_location"`
	MaxMediaSizeMB   int  `json:"max_media_size_mb,omitempty"`

	// Scope / privacy / throttle / handoff
	SessionTimeoutMinutes       int      `json:"session_timeout_minutes,omitempty"`
	MaxMessagesPerSession       int      `json:"max_messages_per_session,omitempty"`
	MaskPIIInReplies            bool     `json:"mask_pii_in_replies"`
	StoreReceivedMedia          bool     `json:"store_received_media"`
	MaxMessagesPerMinutePerUser int      `json:"max_messages_per_minute_per_user,omitempty"`
	ResponseCooldownSeconds     int      `json:"response_cooldown_seconds,omitempty"`
	HandoffKeywords             []string `json:"handoff_keywords,omitempty"`
	HandoffAfterFailures        int      `json:"handoff_after_failures,omitempty"`
}

// behaviorRuntimeSnapshot is what we marshal to behavior.json. It denormalizes
// the company schedule so pkg/agent does not need to re-read the template.
type behaviorRuntimeSnapshot struct {
	agentTemplateBehavior
	Schedule agentTemplateCompanySchedule `json:"schedule"`
}

type agentTemplateModules struct {
	ProfessionalsEnabled bool `json:"professionals_enabled"`
	ProductsEnabled      bool `json:"products_enabled"`
}

type agentTemplateService struct {
	Name      string `json:"name"`
	Details   string `json:"details"`
	Duration  string `json:"duration"`
	Price     string `json:"price"`
	ShowPrice bool   `json:"show_price"`
}

type agentTemplateProfessional struct {
	Name     string                 `json:"name"`
	Role     string                 `json:"role"`
	Bio      string                 `json:"bio"`
	Services []agentTemplateService `json:"services"`
}

type agentTemplateProduct struct {
	Name      string `json:"name"`
	Details   string `json:"details"`
	Price     string `json:"price"`
	ShowPrice bool   `json:"show_price"`
}

type agentTemplateCompanyInfo struct {
	Name        string                       `json:"name"`
	Hours       string                       `json:"hours"`
	Contact     string                       `json:"contact"`
	GeneralInfo string                       `json:"general_info,omitempty"`
	Schedule    agentTemplateCompanySchedule `json:"schedule"`
}

type agentTemplateDaySchedule struct {
	Open bool   `json:"open"`
	From string `json:"from"`
	To   string `json:"to"`
}

type agentTemplateCompanySchedule struct {
	Monday    agentTemplateDaySchedule `json:"monday"`
	Tuesday   agentTemplateDaySchedule `json:"tuesday"`
	Wednesday agentTemplateDaySchedule `json:"wednesday"`
	Thursday  agentTemplateDaySchedule `json:"thursday"`
	Friday    agentTemplateDaySchedule `json:"friday"`
	Saturday  agentTemplateDaySchedule `json:"saturday"`
	Sunday    agentTemplateDaySchedule `json:"sunday"`
	Notes     string                   `json:"notes"`
}

type agentTemplateResponseExamples struct {
	Greeting      string `json:"greeting"`
	Clarification string `json:"clarification"`
	UnknownAnswer string `json:"unknown_answer"`
	Routing       string `json:"routing"`
	Closing       string `json:"closing"`
}

type agentTemplateStyleGuide struct {
	Do   []string `json:"do"`
	Dont []string `json:"dont"`
}

type agentTemplateFallbackPolicy struct {
	MaxClarifyingQuestions int      `json:"max_clarifying_questions"`
	WhenUnsure             string   `json:"when_unsure"`
	WhenToRoute            []string `json:"when_to_route"`
	RouteMessage           string   `json:"route_message"`
}

type agentTemplatePriorityRules struct {
	High   []string `json:"high"`
	Medium []string `json:"medium"`
	Low    []string `json:"low"`
}

type agentTemplateApplyResponse struct {
	Status       string `json:"status"`
	AgentPath    string `json:"agent_path"`
	SoulPath     string `json:"soul_path"`
	BehaviorPath string `json:"behavior_path,omitempty"`
}

var agentTemplateWriteMu sync.Mutex

func (h *Handler) registerAgentTemplateRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/agent/templates/apply", h.handleApplyAgentTemplate)
}

func (h *Handler) handleApplyAgentTemplate(w http.ResponseWriter, r *http.Request) {
	var req agentTemplateApplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body: %v", err))
		return
	}

	if err := validateAgentTemplateRequest(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to load config: %v", err))
		return
	}

	workspace := cfg.WorkspacePath()
	if workspace == "" {
		writeJSONError(w, http.StatusInternalServerError, "workspace path is not configured")
		return
	}

	agentTemplateWriteMu.Lock()
	defer agentTemplateWriteMu.Unlock()

	if err := os.MkdirAll(workspace, 0o755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to ensure workspace directory: %v", err))
		return
	}

	agentMD, err := renderAgentMarkdown(&req)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to render AGENT.md: %v", err))
		return
	}

	soulMD, err := renderSoulMarkdown(&req)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to render SOUL.md: %v", err))
		return
	}

	agentPath := filepath.Join(workspace, "AGENT.md")
	soulPath := filepath.Join(workspace, "SOUL.md")

	if err := backupIfExists(agentPath); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to back up AGENT.md: %v", err))
		return
	}
	if err := backupIfExists(soulPath); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to back up SOUL.md: %v", err))
		return
	}

	if err := os.WriteFile(agentPath, []byte(agentMD), 0o644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to write AGENT.md: %v", err))
		return
	}
	if err := os.WriteFile(soulPath, []byte(soulMD), 0o644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to write SOUL.md: %v", err))
		return
	}

	behaviorPath := filepath.Join(workspace, "behavior.json")
	if err := backupIfExists(behaviorPath); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to back up behavior.json: %v", err))
		return
	}
	snapshot := behaviorRuntimeSnapshot{
		agentTemplateBehavior: req.Behavior,
		Schedule:              req.CompanyInfo.Schedule,
	}
	behaviorJSON, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to encode behavior.json: %v", err))
		return
	}
	if err := os.WriteFile(behaviorPath, behaviorJSON, 0o644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to write behavior.json: %v", err))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(agentTemplateApplyResponse{
		Status:       "applied",
		AgentPath:    agentPath,
		SoulPath:     soulPath,
		BehaviorPath: behaviorPath,
	})
}

func validateAgentTemplateRequest(req *agentTemplateApplyRequest) error {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return errors.New("name is required")
	}
	if strings.ContainsAny(req.Name, "\r\n\t") {
		return errors.New("name must not contain control characters")
	}
	if req.TemplateID == "" {
		return errors.New("template_id is required")
	}
	if req.Language == "" {
		req.Language = "pt-br"
	}
	if req.Tone == "" {
		req.Tone = "friendly"
	}
	return nil
}

func backupIfExists(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("%s is a directory", path)
	}
	return os.Rename(path, path+".bak")
}

// agentMDTemplate renders the workspace AGENT.md file. The format mirrors the
// onboarded AGENT.md (frontmatter + role/mission sections) so the existing
// agent context builder picks it up without any extra changes.
const agentMDTemplate = `---
name: {{.Slug}}
description: >
  {{.PresentationOneLine}}
{{- if .Model}}
model: {{.Model}}
{{- end}}
{{- if .Skills}}
skills:
{{- range .Skills}}
  - {{.}}
{{- end}}
{{- end}}
---

You are {{.Name}}, a customer service assistant for {{.CompanyName}}.

## Role

{{.Presentation}}

## Mission / Capabilities

{{range .Functions}}- {{.}}
{{end}}
## Restrictions

{{range .Prohibitions}}- {{.}}
{{end}}
## Data & Privacy

{{range .Protections}}- {{.}}
{{end}}
## Company Context

- Name: {{.CompanyName}}
- Hours: {{.CompanyHours}}
- Contact: {{.CompanyContact}}
- Language: {{.Language}}
- Tone: {{.Tone}}
{{if .ScheduleLines}}
### Weekly Schedule
{{range .ScheduleLines}}
- {{.}}
{{- end}}
{{- if .ScheduleNotes}}

Schedule notes: {{.ScheduleNotes}}
{{- end}}
{{end}}
{{- if .CompanyGeneralInfo}}
### Company Notes

{{.CompanyGeneralInfo}}
{{end}}
{{if .ProfessionalsBlock}}
{{.ProfessionalsBlock}}{{end}}
{{- if .ProductsBlock}}
{{.ProductsBlock}}{{end}}
{{if .ConversationFlow}}
## Conversation Flow

{{range .ConversationFlow}}- {{.}}
{{end}}{{end}}
{{- if or .StyleGuideDo .StyleGuideDont}}
## Style Guide

{{if .StyleGuideDo}}**Do:**

{{range .StyleGuideDo}}- {{.}}
{{end}}{{end}}{{if .StyleGuideDont}}**Don't:**

{{range .StyleGuideDont}}- {{.}}
{{end}}{{end}}{{end}}
{{- if .FallbackPolicyEnabled}}
## Fallback Policy

- Max clarifying questions: {{.FallbackMaxClarifyingQuestions}}
{{- if .FallbackWhenUnsure}}
- When unsure: {{.FallbackWhenUnsure}}
{{- end}}
{{- if .FallbackWhenToRoute}}
- When to route:
{{range .FallbackWhenToRoute}}  - {{.}}
{{end}}{{- end}}
{{- if .FallbackRouteMessage}}
- Route message: {{.FallbackRouteMessage}}
{{- end}}
{{end}}
{{- if or .PriorityHigh .PriorityMedium .PriorityLow}}
## Priority Rules

{{if .PriorityHigh}}**High priority:**

{{range .PriorityHigh}}- {{.}}
{{end}}{{end}}{{if .PriorityMedium}}**Medium priority:**

{{range .PriorityMedium}}- {{.}}
{{end}}{{end}}{{if .PriorityLow}}**Low priority:**

{{range .PriorityLow}}- {{.}}
{{end}}{{end}}{{end}}
{{- if .KnowledgePolicy}}
## Knowledge Policy

{{range .KnowledgePolicy}}- {{.}}
{{end}}{{end}}
{{- if .SecurityRules}}
## Security Rules

{{range .SecurityRules}}- {{.}}
{{end}}{{end}}
{{- if .QualityMetrics}}
## Quality Metrics

{{range .QualityMetrics}}- {{.}}
{{end}}{{end}}
{{- if .RequiredFieldsLines}}
## Required Fields by Intent

{{range .RequiredFieldsLines}}- {{.}}
{{end}}{{end}}
{{- if .ResponseExampleLines}}
## Response Examples

{{range .ResponseExampleLines}}- {{.}}
{{end}}{{end}}
{{- if .HandoffJSON}}
## Handoff Summary Template

` + "```json" + `
{{.HandoffJSON}}
` + "```" + `
{{end}}
{{- if .StructuredOutputJSON}}
## Structured Output Template

` + "```json" + `
{{.StructuredOutputJSON}}
` + "```" + `
{{end}}
{{- if .RecommendedTools}}
## Recommended Tools

{{range .RecommendedTools}}- ` + "`{{.}}`" + `
{{end}}{{end}}
{{- if .ToolNamespaces}}
## Tool Namespaces

{{range .ToolNamespaces}}- ` + "`{{.}}`" + `
{{end}}{{end}}
{{- if .RequiredIntegrations}}
## Required Integrations

{{range .RequiredIntegrations}}- ` + "`{{.}}`" + `
{{end}}{{end}}
{{- if .PermissionLevel}}
## Permission Level

- ` + "`{{.PermissionLevel}}`" + `{{if .PermissionLevelHuman}} — {{.PermissionLevelHuman}}{{end}}
{{end}}
{{- if .ApprovalRequiredFor}}
## Approval Required For

The following cases must always be confirmed with the responsible team or sector
before being acted on — never execute or promise outcomes without explicit approval:

{{range .ApprovalRequiredFor}}- {{.}}
{{end}}{{end}}
Read ` + "`SOUL.md`" + ` as part of your identity and communication style.
`

const soulMDTemplate = `# Soul

I am {{.Name}}.

## Personality

{{range .Personality}}- {{.}}
{{end}}
## Values

{{range .Values}}- {{.}}
{{end}}
## Tone

{{.Tone}}

## Language

{{.Language}}
`

type agentTemplateRenderData struct {
	Slug                string
	Name                string
	PresentationOneLine string
	Presentation        string
	Model               string
	Skills              []string
	Functions           []string
	Prohibitions        []string
	Protections         []string
	Personality         []string
	Values              []string
	CompanyName         string
	CompanyHours        string
	CompanyContact      string
	CompanyGeneralInfo  string
	ScheduleLines       []string
	ScheduleNotes       string
	Language            string
	Tone                string

	ConversationFlow                []string
	StyleGuideDo                    []string
	StyleGuideDont                  []string
	FallbackPolicyEnabled           bool
	FallbackMaxClarifyingQuestions  int
	FallbackWhenUnsure              string
	FallbackWhenToRoute             []string
	FallbackRouteMessage            string
	PriorityHigh                    []string
	PriorityMedium                  []string
	PriorityLow                     []string
	KnowledgePolicy                 []string
	SecurityRules                   []string
	QualityMetrics                  []string
	RequiredFieldsLines             []string
	ResponseExampleLines            []string
	HandoffJSON                     string
	StructuredOutputJSON            string
	ProfessionalsBlock              string
	ProductsBlock                   string
	RecommendedTools                []string
	ToolNamespaces                  []string
	RequiredIntegrations            []string
	PermissionLevel                 string
	PermissionLevelHuman            string
	ApprovalRequiredFor             []string
}

func buildRenderData(req *agentTemplateApplyRequest) agentTemplateRenderData {
	values := req.Values
	if len(values) == 0 {
		values = []string{
			"Respect for the customer",
			"Honesty and transparency",
			"Privacy and data protection",
		}
	}

	data := agentTemplateRenderData{
		Slug:                slugify(req.Name),
		Name:                req.Name,
		PresentationOneLine: firstLine(req.Presentation),
		Presentation:        req.Presentation,
		Model:               req.Model,
		Skills:              nonEmpty(req.Skills),
		Functions:           nonEmpty(req.Functions),
		Prohibitions:        nonEmpty(req.Prohibitions),
		Protections:         nonEmpty(req.Protections),
		Personality:         nonEmpty(req.Personality),
		Values:              nonEmpty(values),
		CompanyName:         req.CompanyInfo.Name,
		CompanyHours:        formatScheduleHours(req.CompanyInfo.Schedule, req.CompanyInfo.Hours),
		CompanyContact:      req.CompanyInfo.Contact,
		CompanyGeneralInfo:  strings.TrimSpace(req.CompanyInfo.GeneralInfo),
		ScheduleLines:       buildScheduleLines(req.CompanyInfo.Schedule),
		ScheduleNotes:       strings.TrimSpace(req.CompanyInfo.Schedule.Notes),
		Language:            req.Language,
		Tone:                req.Tone,

		ConversationFlow:               nonEmpty(req.ConversationFlow),
		StyleGuideDo:                   nonEmpty(req.StyleGuide.Do),
		StyleGuideDont:                 nonEmpty(req.StyleGuide.Dont),
		FallbackMaxClarifyingQuestions: req.FallbackPolicy.MaxClarifyingQuestions,
		FallbackWhenUnsure:             strings.TrimSpace(req.FallbackPolicy.WhenUnsure),
		FallbackWhenToRoute:            nonEmpty(req.FallbackPolicy.WhenToRoute),
		FallbackRouteMessage:           strings.TrimSpace(req.FallbackPolicy.RouteMessage),
		PriorityHigh:                   nonEmpty(req.PriorityRules.High),
		PriorityMedium:                 nonEmpty(req.PriorityRules.Medium),
		PriorityLow:                    nonEmpty(req.PriorityRules.Low),
		KnowledgePolicy:                nonEmpty(req.KnowledgePolicy),
		SecurityRules:                  nonEmpty(req.SecurityRules),
		QualityMetrics:                 nonEmpty(req.QualityMetrics),
		RequiredFieldsLines:            buildRequiredFieldsLines(req.RequiredFieldsByIntent),
		ResponseExampleLines:           buildResponseExampleLines(req.ResponseExamples),
		HandoffJSON:                    marshalIndentString(req.HandoffSummaryTemplate),
		StructuredOutputJSON:           marshalIndentString(req.StructuredOutputTemplate),
	}

	if req.Modules.ProfessionalsEnabled {
		data.ProfessionalsBlock = buildProfessionalsBlock(req.Professionals)
	}
	if req.Modules.ProductsEnabled {
		data.ProductsBlock = buildProductsBlock(req.Products)
	}

	data.RecommendedTools = nonEmpty(req.RecommendedTools)
	data.ToolNamespaces = nonEmpty(req.ToolNamespaces)
	data.RequiredIntegrations = nonEmpty(req.RequiredIntegrations)
	data.ApprovalRequiredFor = nonEmpty(req.ApprovalRequiredFor)
	data.PermissionLevel = strings.TrimSpace(req.PermissionLevel)
	data.PermissionLevelHuman = humanPermissionLevel(data.PermissionLevel)

	data.FallbackPolicyEnabled = data.FallbackMaxClarifyingQuestions > 0 ||
		data.FallbackWhenUnsure != "" ||
		len(data.FallbackWhenToRoute) > 0 ||
		data.FallbackRouteMessage != ""

	return data
}

func buildRequiredFieldsLines(m map[string][]string) []string {
	if len(m) == 0 {
		return nil
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sortStrings(keys)
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		fields := nonEmpty(m[k])
		if len(fields) == 0 {
			continue
		}
		out = append(out, fmt.Sprintf("**%s**: %s", k, strings.Join(fields, ", ")))
	}
	return out
}

func buildResponseExampleLines(ex agentTemplateResponseExamples) []string {
	out := []string{}
	add := func(label, value string) {
		v := strings.TrimSpace(value)
		if v == "" {
			return
		}
		out = append(out, fmt.Sprintf("**%s:** %s", label, v))
	}
	add("Greeting", ex.Greeting)
	add("Clarification", ex.Clarification)
	add("Unknown answer", ex.UnknownAnswer)
	add("Routing", ex.Routing)
	add("Closing", ex.Closing)
	if len(out) == 0 {
		return nil
	}
	return out
}

// buildProfessionalsBlock renders the "## Professionals & Services" section
// as a markdown string. Returns "" when there is no valid professional/service
// to render (so the AGENT.md template can skip the heading entirely).
func buildProfessionalsBlock(professionals []agentTemplateProfessional) string {
	var sb strings.Builder
	rendered := 0
	for _, prof := range professionals {
		name := strings.TrimSpace(prof.Name)
		if name == "" {
			continue
		}

		// Render professional heading: ### Name — Role
		sb.WriteString("### ")
		sb.WriteString(name)
		if role := strings.TrimSpace(prof.Role); role != "" {
			sb.WriteString(" — ")
			sb.WriteString(role)
		}
		sb.WriteString("\n")

		if bio := strings.TrimSpace(prof.Bio); bio != "" {
			sb.WriteString("> ")
			sb.WriteString(bio)
			sb.WriteString("\n")
		}
		sb.WriteString("\n")

		services := 0
		for _, service := range prof.Services {
			line := formatServiceLine(service)
			if line == "" {
				continue
			}
			sb.WriteString("- ")
			sb.WriteString(line)
			sb.WriteString("\n")
			services++
		}
		if services == 0 {
			sb.WriteString("- _No services configured for this professional._\n")
		}
		sb.WriteString("\n")
		rendered++
	}

	if rendered == 0 {
		return ""
	}

	var out strings.Builder
	out.WriteString("## Professionals & Services\n\n")
	out.WriteString(sb.String())
	out.WriteString("> When mentioning prices to the customer, only reference the values shown above.\n")
	out.WriteString("> Services without a public price must be answered as \"preço sob consulta\" — never invent a value.\n")
	return out.String()
}

// buildProductsBlock renders the "## Products & Pricing" section.
// Returns "" when there are no valid products.
func buildProductsBlock(products []agentTemplateProduct) string {
	var sb strings.Builder
	rendered := 0
	for _, product := range products {
		name := strings.TrimSpace(product.Name)
		if name == "" {
			continue
		}
		sb.WriteString("- **")
		sb.WriteString(name)
		sb.WriteString("**")

		price := strings.TrimSpace(product.Price)
		showPrice := product.ShowPrice && price != ""
		if showPrice {
			sb.WriteString(" (")
			sb.WriteString(price)
			sb.WriteString(")")
		}

		details := strings.TrimSpace(product.Details)
		if details != "" {
			sb.WriteString(": ")
			sb.WriteString(details)
		}

		if !showPrice {
			if details != "" {
				sb.WriteString(" — preço sob consulta")
			} else {
				sb.WriteString(": preço sob consulta")
			}
		}
		sb.WriteString("\n")
		rendered++
	}
	if rendered == 0 {
		return ""
	}

	var out strings.Builder
	out.WriteString("## Products & Pricing\n\n")
	out.WriteString(sb.String())
	out.WriteString("\n> Prices shown above are the only valid reference. Items without a public price must be answered as \"preço sob consulta\" — never invent a value.\n")
	return out.String()
}

// formatServiceLine renders one service bullet body (without the leading "- ").
// Returns "" if the service has no name.
func formatServiceLine(service agentTemplateService) string {
	name := strings.TrimSpace(service.Name)
	if name == "" {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("**")
	sb.WriteString(name)
	sb.WriteString("**")

	duration := strings.TrimSpace(service.Duration)
	price := strings.TrimSpace(service.Price)
	showPrice := service.ShowPrice && price != ""

	parens := make([]string, 0, 2)
	if duration != "" {
		parens = append(parens, duration)
	}
	if showPrice {
		parens = append(parens, price)
	}
	if len(parens) > 0 {
		sb.WriteString(" (")
		sb.WriteString(strings.Join(parens, ", "))
		sb.WriteString(")")
	}

	details := strings.TrimSpace(service.Details)
	if details != "" {
		sb.WriteString(": ")
		sb.WriteString(details)
	}

	if !showPrice {
		if details != "" {
			sb.WriteString(" — preço sob consulta")
		} else {
			sb.WriteString(": preço sob consulta")
		}
	}

	return sb.String()
}

var scheduleDayLabels = []struct {
	Key   string
	Label string
	Day   func(s agentTemplateCompanySchedule) agentTemplateDaySchedule
}{
	{"Mon", "Monday", func(s agentTemplateCompanySchedule) agentTemplateDaySchedule { return s.Monday }},
	{"Tue", "Tuesday", func(s agentTemplateCompanySchedule) agentTemplateDaySchedule { return s.Tuesday }},
	{"Wed", "Wednesday", func(s agentTemplateCompanySchedule) agentTemplateDaySchedule { return s.Wednesday }},
	{"Thu", "Thursday", func(s agentTemplateCompanySchedule) agentTemplateDaySchedule { return s.Thursday }},
	{"Fri", "Friday", func(s agentTemplateCompanySchedule) agentTemplateDaySchedule { return s.Friday }},
	{"Sat", "Saturday", func(s agentTemplateCompanySchedule) agentTemplateDaySchedule { return s.Saturday }},
	{"Sun", "Sunday", func(s agentTemplateCompanySchedule) agentTemplateDaySchedule { return s.Sunday }},
}

// buildScheduleLines renders one line per day of the week for the
// "## Company Context" → schedule section. Returns nil if the schedule
// is empty (all days marked closed AND missing times) so the caller can
// fall back to the legacy `hours` string.
func buildScheduleLines(s agentTemplateCompanySchedule) []string {
	out := make([]string, 0, 7)
	hasAny := false
	for _, dl := range scheduleDayLabels {
		day := dl.Day(s)
		if day.Open {
			hasAny = true
			from := strings.TrimSpace(day.From)
			to := strings.TrimSpace(day.To)
			if from == "" && to == "" {
				out = append(out, fmt.Sprintf("%s: Open", dl.Label))
			} else if to == "" {
				out = append(out, fmt.Sprintf("%s: from %s", dl.Label, from))
			} else if from == "" {
				out = append(out, fmt.Sprintf("%s: until %s", dl.Label, to))
			} else {
				out = append(out, fmt.Sprintf("%s: %s – %s", dl.Label, from, to))
			}
		} else {
			out = append(out, fmt.Sprintf("%s: Closed", dl.Label))
		}
	}
	if !hasAny {
		return nil
	}
	return out
}

// formatScheduleHours produces a compact one-line summary used in the
// "Hours:" frontline of Company Context. Falls back to the legacy free-text
// `hours` field when the structured schedule has no open day.
func formatScheduleHours(s agentTemplateCompanySchedule, legacyHours string) string {
	lines := buildScheduleLines(s)
	if len(lines) == 0 {
		return strings.TrimSpace(legacyHours)
	}
	parts := make([]string, 0, len(lines))
	for _, l := range lines {
		parts = append(parts, l)
	}
	return strings.Join(parts, " | ")
}

func humanPermissionLevel(level string) string {
	switch level {
	case "read_only":
		return "Read-only — must never write or modify state without explicit approval"
	case "write_with_confirmation":
		return "Write with confirmation — requires explicit confirmation before any state-changing action"
	case "write_allowed":
		return "Write allowed — may execute state-changing actions within scope without per-action confirmation"
	}
	if level == "" {
		return ""
	}
	return level
}

func marshalIndentString(payload map[string]any) string {
	if len(payload) == 0 {
		return ""
	}
	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return ""
	}
	return string(bytes)
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j-1] > s[j]; j-- {
			s[j-1], s[j] = s[j], s[j-1]
		}
	}
}

func renderAgentMarkdown(req *agentTemplateApplyRequest) (string, error) {
	tpl, err := template.New("agent").Parse(agentMDTemplate)
	if err != nil {
		return "", err
	}
	var buf strings.Builder
	if err := tpl.Execute(&buf, buildRenderData(req)); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderSoulMarkdown(req *agentTemplateApplyRequest) (string, error) {
	tpl, err := template.New("soul").Parse(soulMDTemplate)
	if err != nil {
		return "", err
	}
	var buf strings.Builder
	if err := tpl.Execute(&buf, buildRenderData(req)); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func firstLine(s string) string {
	idx := strings.IndexAny(s, "\r\n")
	if idx < 0 {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(s[:idx])
}

func nonEmpty(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}

func slugify(name string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		ascii := transliterateLatin(r)
		switch {
		case ascii >= 'a' && ascii <= 'z', ascii >= '0' && ascii <= '9':
			b.WriteRune(ascii)
			prevDash = false
		case ascii == ' ', ascii == '-', ascii == '_':
			if !prevDash && b.Len() > 0 {
				b.WriteByte('-')
				prevDash = true
			}
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if out == "" {
		return "agent"
	}
	return out
}

func transliterateLatin(r rune) rune {
	switch r {
	case 'á', 'à', 'â', 'ã', 'ä', 'å':
		return 'a'
	case 'é', 'è', 'ê', 'ë':
		return 'e'
	case 'í', 'ì', 'î', 'ï':
		return 'i'
	case 'ó', 'ò', 'ô', 'õ', 'ö':
		return 'o'
	case 'ú', 'ù', 'û', 'ü':
		return 'u'
	case 'ç':
		return 'c'
	case 'ñ':
		return 'n'
	}
	return r
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
