package clara

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Answers mirrors the shape stored in company_intakes.answers_json that the
// pre-cadastro UI reads. Only the fields Clara touches are typed; the rest is
// preserved via the Extra map so existing answers (collected by the legacy
// script-driven flow on the same intake) are never dropped.
type Answers struct {
	Offer          string   `json:"offer,omitempty"`
	Segments       []string `json:"segments,omitempty"`
	BusinessModels []string `json:"business_models,omitempty"`
	Channels       []string `json:"channels,omitempty"`
	Systems        []string `json:"systems,omitempty"`
	SystemNotes    string   `json:"system_notes,omitempty"`
	Pains          []string `json:"pains,omitempty"`

	// Light-onboarding fields collected by Clara to seed the 4 default
	// agents (Ana, Leo, Maya, Sofia). All optional — Clara only sets a field
	// when the visitor mentions it explicitly. Technical follow-up (prices,
	// CRM credentials, etc.) happens later via Sofia on WhatsApp.
	Website             string `json:"website,omitempty"`
	Instagram           string `json:"instagram,omitempty"`
	CRMName             string `json:"crm_name,omitempty"`
	CRMNotes            string `json:"crm_notes,omitempty"`
	QuotingPersonalized *bool  `json:"quoting_personalized,omitempty"`
	QuotingNotes        string `json:"quoting_notes,omitempty"`
	PriorityAgent       string `json:"priority_agent,omitempty"`
	PriorityReason      string `json:"priority_reason,omitempty"`

	// Structured pain tagging. ProblemArea is the *type* of bottleneck
	// (vendas / atendimento / suporte / agendamento / marketing / gestao);
	// the human-readable description still lives in Pains. SalesOnline +
	// ProductType tell us how the visitor sells today so the finalize
	// screen can render agent recommendations grounded in their reality.
	ProblemArea     string `json:"problem_area,omitempty"`
	ProblemAreaNote string `json:"problem_area_note,omitempty"`
	SalesOnline     *bool  `json:"sales_online,omitempty"`
	ProductType     string `json:"product_type,omitempty"`
	SalesNote       string `json:"sales_note,omitempty"`

	Extra map[string]any `json:"-"`
}

// ParseAnswers decodes the JSONB blob without losing keys we don't model.
func ParseAnswers(raw json.RawMessage) (*Answers, error) {
	if len(raw) == 0 {
		return &Answers{Extra: map[string]any{}}, nil
	}
	var loose map[string]json.RawMessage
	if err := json.Unmarshal(raw, &loose); err != nil {
		return nil, fmt.Errorf("answers: %w", err)
	}
	a := &Answers{Extra: map[string]any{}}
	consume := func(key string, dst any) {
		if v, ok := loose[key]; ok {
			_ = json.Unmarshal(v, dst)
			delete(loose, key)
		}
	}
	consume("offer", &a.Offer)
	consume("segments", &a.Segments)
	consume("business_models", &a.BusinessModels)
	consume("channels", &a.Channels)
	consume("systems", &a.Systems)
	consume("system_notes", &a.SystemNotes)
	consume("pains", &a.Pains)
	consume("website", &a.Website)
	consume("instagram", &a.Instagram)
	consume("crm_name", &a.CRMName)
	consume("crm_notes", &a.CRMNotes)
	consume("quoting_personalized", &a.QuotingPersonalized)
	consume("quoting_notes", &a.QuotingNotes)
	consume("priority_agent", &a.PriorityAgent)
	consume("priority_reason", &a.PriorityReason)
	consume("problem_area", &a.ProblemArea)
	consume("problem_area_note", &a.ProblemAreaNote)
	consume("sales_online", &a.SalesOnline)
	consume("product_type", &a.ProductType)
	consume("sales_note", &a.SalesNote)
	for k, v := range loose {
		var x any
		_ = json.Unmarshal(v, &x)
		a.Extra[k] = x
	}
	return a, nil
}

// MarshalAnswers re-encodes the answers map preserving unknown keys.
func (a *Answers) Marshal() (json.RawMessage, error) {
	out := map[string]any{}
	for k, v := range a.Extra {
		out[k] = v
	}
	if a.Offer != "" {
		out["offer"] = a.Offer
	}
	if len(a.Segments) > 0 {
		out["segments"] = a.Segments
	}
	if len(a.BusinessModels) > 0 {
		out["business_models"] = a.BusinessModels
	}
	if len(a.Channels) > 0 {
		out["channels"] = a.Channels
	}
	if len(a.Systems) > 0 {
		out["systems"] = a.Systems
	}
	if a.SystemNotes != "" {
		out["system_notes"] = a.SystemNotes
	}
	if len(a.Pains) > 0 {
		out["pains"] = a.Pains
	}
	if a.Website != "" {
		out["website"] = a.Website
	}
	if a.Instagram != "" {
		out["instagram"] = a.Instagram
	}
	if a.CRMName != "" {
		out["crm_name"] = a.CRMName
	}
	if a.CRMNotes != "" {
		out["crm_notes"] = a.CRMNotes
	}
	if a.QuotingPersonalized != nil {
		out["quoting_personalized"] = *a.QuotingPersonalized
	}
	if a.QuotingNotes != "" {
		out["quoting_notes"] = a.QuotingNotes
	}
	if a.PriorityAgent != "" {
		out["priority_agent"] = a.PriorityAgent
	}
	if a.PriorityReason != "" {
		out["priority_reason"] = a.PriorityReason
	}
	if a.ProblemArea != "" {
		out["problem_area"] = a.ProblemArea
	}
	if a.ProblemAreaNote != "" {
		out["problem_area_note"] = a.ProblemAreaNote
	}
	if a.SalesOnline != nil {
		out["sales_online"] = *a.SalesOnline
	}
	if a.ProductType != "" {
		out["product_type"] = a.ProductType
	}
	if a.SalesNote != "" {
		out["sales_note"] = a.SalesNote
	}
	return json.Marshal(out)
}

// IntakeMutation is the side-effect of one tool call. The HTTP handler
// translates this into store calls.
type IntakeMutation struct {
	// ContactName / CompanyName are updated only when non-empty.
	ContactName string
	CompanyName string

	// AnswersDelta, when non-nil, is the post-tool answers blob to persist
	// via SaveDraft. Nil = no answers change.
	AnswersDelta *Answers

	// MarkQualified, when true, instructs the handler to call MarkQualified
	// in the store. The Reason goes into chat_messages metadata only.
	MarkQualified  bool
	QualifiedReason string

	// HandoffRequested mirrors MarkQualified for the manual-review escalation.
	HandoffRequested bool
	HandoffReason    string
}

// Apply executes one tool call against the current Answers blob and returns a
// mutation describing what the handler must persist. Errors here are always
// safe to surface to the model as a tool result so it can self-correct.
func Apply(name string, rawArgs json.RawMessage, current *Answers) (*IntakeMutation, error) {
	if current == nil {
		current = &Answers{Extra: map[string]any{}}
	}
	m := &IntakeMutation{}
	switch ToolName(name) {
	case ToolSetIdentity:
		var in ToolInputIdentity
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		m.ContactName = strings.TrimSpace(in.ContactName)
		m.CompanyName = strings.TrimSpace(in.CompanyName)

	case ToolSetBusiness:
		var in ToolInputBusiness
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		if strings.TrimSpace(in.Description) != "" {
			current.Offer = strings.TrimSpace(in.Description)
		}
		current.Segments = mergeUnique(current.Segments, in.Segments)
		current.BusinessModels = mergeUnique(current.BusinessModels, in.BusinessModels)
		// Mirror to the legacy `business_type` scalar that the submit validator
		// (validateIntakeMinimum) still requires. Without this, the agent flow
		// would always 400 on /submit even after extracting the same data
		// through set_business.
		if bt := pickBusinessType(in.BusinessModels, in.Segments); bt != "" {
			current.Extra["business_type"] = bt
		}
		m.AnswersDelta = current

	case ToolSetPain:
		var in ToolInputPain
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		if t := strings.TrimSpace(in.Text); t != "" {
			current.Pains = mergeUnique(current.Pains, []string{t})
			m.AnswersDelta = current
		}

	case ToolSetChannels:
		var in ToolInputChannels
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		current.Channels = mergeUnique(current.Channels, normalizeChannels(in.Channels))
		m.AnswersDelta = current

	case ToolSetSystems:
		var in ToolInputSystems
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		current.Systems = mergeUnique(current.Systems, in.Systems)
		if n := strings.TrimSpace(in.Notes); n != "" {
			current.SystemNotes = n
		}
		m.AnswersDelta = current

	case ToolSetWebPresence:
		var in ToolInputWebPresence
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		if w := strings.TrimSpace(in.Website); w != "" {
			current.Website = normalizeURL(w)
		}
		if ig := strings.TrimSpace(in.Instagram); ig != "" {
			current.Instagram = normalizeHandle(ig)
		}
		m.AnswersDelta = current

	case ToolSetCRM:
		var in ToolInputCRM
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		if n := strings.TrimSpace(in.Name); n != "" {
			current.CRMName = n
			// Mirror to systems[] so the legacy summary view also surfaces it.
			current.Systems = mergeUnique(current.Systems, []string{n})
		}
		if notes := strings.TrimSpace(in.Notes); notes != "" {
			current.CRMNotes = notes
		}
		m.AnswersDelta = current

	case ToolSetQuoting:
		var in ToolInputQuoting
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		v := in.Personalized
		current.QuotingPersonalized = &v
		if n := strings.TrimSpace(in.Notes); n != "" {
			current.QuotingNotes = n
		}
		m.AnswersDelta = current

	case ToolSetAgentPriority:
		var in ToolInputAgentPriority
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		agent := strings.ToLower(strings.TrimSpace(in.Agent))
		switch agent {
		case "ana", "leo", "maya", "sofia":
			current.PriorityAgent = agent
			if r := strings.TrimSpace(in.Reason); r != "" {
				current.PriorityReason = r
			}
			m.AnswersDelta = current
		default:
			return nil, fmt.Errorf("priority agent must be one of ana|leo|maya|sofia, got %q", in.Agent)
		}

	case ToolSetProblemArea:
		var in ToolInputProblemArea
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		area := strings.ToLower(strings.TrimSpace(in.Area))
		switch area {
		case "vendas", "atendimento", "suporte", "agendamento", "marketing", "gestao":
			current.ProblemArea = area
			if n := strings.TrimSpace(in.Note); n != "" {
				current.ProblemAreaNote = n
			}
			m.AnswersDelta = current
		default:
			return nil, fmt.Errorf("problem area must be one of vendas|atendimento|suporte|agendamento|marketing|gestao, got %q", in.Area)
		}

	case ToolSetSalesMode:
		var in ToolInputSalesMode
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		v := in.Online
		current.SalesOnline = &v
		if pt := strings.TrimSpace(in.ProductType); pt != "" {
			current.ProductType = strings.ToLower(pt)
		}
		if n := strings.TrimSpace(in.Note); n != "" {
			current.SalesNote = n
		}
		m.AnswersDelta = current

	case ToolMarkQualified:
		var in ToolInputMarkQualified
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		m.MarkQualified = true
		m.QualifiedReason = strings.TrimSpace(in.Reason)

	case ToolRequestHandoff:
		var in ToolInputRequestHandoff
		if err := json.Unmarshal(rawArgs, &in); err != nil {
			return nil, err
		}
		m.HandoffRequested = true
		m.HandoffReason = strings.TrimSpace(in.Reason)

	default:
		return nil, fmt.Errorf("unknown tool: %q", name)
	}
	return m, nil
}

// mergeUnique appends items to base preserving order and dropping case-insensitive duplicates.
func mergeUnique(base, add []string) []string {
	seen := make(map[string]struct{}, len(base)+len(add))
	out := make([]string, 0, len(base)+len(add))
	for _, v := range base {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		k := strings.ToLower(v)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, v)
	}
	for _, v := range add {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		k := strings.ToLower(v)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, v)
	}
	return out
}

// normalizeURL strips trailing slashes/spaces and prefixes https:// when the
// visitor pasted a bare domain. We deliberately don't validate further — the
// goal is to keep what the person actually typed, not gatekeep on the form.
func normalizeURL(raw string) string {
	v := strings.TrimSpace(raw)
	v = strings.TrimRight(v, "/")
	lower := strings.ToLower(v)
	if lower == "" {
		return ""
	}
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return v
	}
	return "https://" + v
}

// normalizeHandle keeps Instagram identifiers in a consistent "@user" form,
// accepting both URLs ("instagram.com/foo") and bare handles ("foo" / "@foo").
func normalizeHandle(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return ""
	}
	if strings.Contains(v, "instagram.com/") {
		idx := strings.Index(v, "instagram.com/")
		v = v[idx+len("instagram.com/"):]
		v = strings.Trim(v, "/")
	}
	v = strings.TrimPrefix(v, "@")
	if v == "" {
		return ""
	}
	return "@" + v
}

// pickBusinessType collapses set_business inputs to the single-value
// `business_type` string the legacy validator expects. Order of preference:
// the first explicit business_model, the first segment, "outro" as fallback.
func pickBusinessType(models, segments []string) string {
	for _, v := range models {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	for _, v := range segments {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return ""
}

// normalizeChannels maps free-form names to a small canonical set so the admin
// UI can group them. Unknown values pass through lowercased.
func normalizeChannels(in []string) []string {
	out := make([]string, 0, len(in))
	for _, raw := range in {
		v := strings.ToLower(strings.TrimSpace(raw))
		switch {
		case v == "":
			continue
		case strings.Contains(v, "whats") || v == "zap":
			out = append(out, "whatsapp")
		case strings.Contains(v, "insta") || v == "ig":
			out = append(out, "instagram")
		case strings.Contains(v, "telefone") || v == "ligacao" || v == "ligação" || v == "call":
			out = append(out, "telefone")
		case strings.Contains(v, "site") || strings.Contains(v, "web"):
			out = append(out, "site")
		case strings.Contains(v, "email") || strings.Contains(v, "e-mail"):
			out = append(out, "email")
		case strings.Contains(v, "presen"):
			out = append(out, "presencial")
		case strings.Contains(v, "market"):
			out = append(out, "marketplace")
		default:
			out = append(out, v)
		}
	}
	return out
}
