package tenant

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type EmpresaMemoryBackfillResult struct {
	Written      bool
	StateUpdated bool
}

var empresaMemorySegmentAliases = map[string]string{
	"clinica":     "saude",
	"clínica":     "saude",
	"clinico":     "saude",
	"clínico":     "saude",
	"saude":       "saude",
	"saúde":       "saude",
	"restaurante": "alimentacao",
	"alimentacao": "alimentacao",
	"alimentação": "alimentacao",
	"ecommerce":   "varejo",
	"e-commerce":  "varejo",
	"loja":        "varejo",
	"varejo":      "varejo",
	"vendas":      "servicos",
	"servicos":    "servicos",
	"serviços":    "servicos",
	"beleza":      "beleza",
	"estetica":    "beleza",
	"estética":    "beleza",
	"educacao":    "educacao",
	"educação":    "educacao",
	"imobiliaria": "imobiliaria",
	"imobiliária": "imobiliaria",
}

func BackfillEmpresaMemoryFromOnboardingState(volumePath string) (EmpresaMemoryBackfillResult, error) {
	var out EmpresaMemoryBackfillResult
	workspaceRoot := filepath.Join(volumePath, "workspace")
	empresaPath := filepath.Join(workspaceRoot, "memory", "empresa.md")
	if data, err := os.ReadFile(empresaPath); err == nil && empresaMemoryFilled(string(data)) {
		return out, nil
	}

	statePath := filepath.Join(workspaceRoot, "state", "onboarding.json")
	data, err := os.ReadFile(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return out, nil
		}
		return out, fmt.Errorf("read onboarding.json: %w", err)
	}
	var state map[string]any
	if err := json.Unmarshal(data, &state); err != nil {
		return out, fmt.Errorf("parse onboarding.json: %w", err)
	}

	content := renderEmpresaMemoryFromOnboardingState(state)
	if content == "" {
		return out, nil
	}
	if err := os.MkdirAll(filepath.Dir(empresaPath), 0o755); err != nil {
		return out, fmt.Errorf("mkdir memory: %w", err)
	}
	if err := writeFileAtomic(empresaPath, []byte(content), 0o644); err != nil {
		return out, fmt.Errorf("write empresa.md: %w", err)
	}
	out.Written = true

	recomputeOnboardingStateBlockers(state, true)
	updated, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return out, fmt.Errorf("marshal onboarding.json: %w", err)
	}
	updated = append(updated, '\n')
	if err := writeFileAtomic(statePath, updated, 0o644); err != nil {
		return out, fmt.Errorf("write onboarding.json: %w", err)
	}
	out.StateUpdated = true
	return out, nil
}

func renderEmpresaMemoryFromOnboardingState(state map[string]any) string {
	discovery := mapField(state, "discovery")
	owner := mapField(state, "owner_captured")
	completedAt := stringField(discovery, "completed_at")
	email := strings.ToLower(strings.TrimSpace(stringField(owner, "email")))
	whatsapp := sanitizeEmpresaLineValue(stringField(owner, "whatsapp"))
	if completedAt == "" || email == "" || whatsapp == "" {
		return ""
	}

	summary := sanitizeEmpresaLongValue(stringField(discovery, "summary"))
	company := inferEmpresaName(summary)
	if company == "" {
		return ""
	}
	segment := canonicalEmpresaSegment(stringField(discovery, "segment"))
	ownerName := sanitizeEmpresaLineValue(stringField(owner, "name"))
	validatedAt := time.Now().UTC().Format("2006-01-02")
	description := summary
	if description == "" {
		description = "Empresa do segmento " + segment + " capturada no discovery da Sofia."
	}

	lines := []string{
		"# Memória da empresa",
		"",
		"Nome: " + company,
		"Segmento: " + segment,
		"Descrição: " + description,
		"Produtos ou serviços: a detalhar com Catarina",
		"Horário: a detalhar com Catarina",
		"Endereço: a detalhar com Catarina",
		"Regiões atendidas: a detalhar com Catarina",
		"WhatsApp: " + whatsapp,
		"Email: " + email,
		"Instagram: a detalhar com Catarina",
		"Site: a detalhar com Catarina",
		"Formas de pagamento: a detalhar com Catarina",
		"Pode falar preço: a detalhar com Catarina",
		"Faixa de preço: a detalhar com Catarina",
		"Quando chamar humano: a detalhar com Catarina",
		"Informações que nunca podem ser inventadas: dados não confirmados pelo dono",
		"Informações proibidas de falar: a detalhar com Catarina",
		"Segmento detectado: " + segment,
	}
	lines = append(lines, empresaSegmentLines(segment, summary)...)
	lines = append(lines,
		"Status da informação: validado pelo dono em "+validatedAt+" (onboarding via discovery; aprofundamento com Catarina pendente)",
		"",
		"## Cadastro da empresa — concluído",
		"",
		"- Responsável: "+fallbackText(ownerName, "a detalhar com Catarina"),
		"- E-mail de acesso: "+email,
		"- WhatsApp do responsável: "+whatsapp,
	)
	if summary != "" {
		lines = append(lines, "- Resumo do discovery: "+summary)
	}
	lines = append(lines,
		"",
		"## Pendências sinalizadas pro dono resolver",
		"",
		"- Catarina deve aprofundar equipe, casos de exceção, FAQ, histórico e regras tácitas antes da promoção final.",
	)
	return strings.TrimRight(strings.Join(lines, "\n"), "\n") + "\n"
}

func empresaMemoryFilled(content string) bool {
	normalized := normalizeEmpresaText(content)
	if strings.Contains(normalized, "status: pendente de validacao") {
		return false
	}
	filled := 0
	for _, line := range strings.Split(content, "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		value := strings.TrimSpace(parts[1])
		if value == "" || strings.HasPrefix(normalizeEmpresaText(value), "pendente") {
			continue
		}
		filled++
	}
	return filled >= 3
}

func normalizeEmpresaText(value string) string {
	value = strings.ToLower(value)
	replacer := strings.NewReplacer(
		"á", "a", "à", "a", "ã", "a", "â", "a",
		"é", "e", "ê", "e",
		"í", "i",
		"ó", "o", "õ", "o", "ô", "o",
		"ú", "u",
		"ç", "c",
	)
	return replacer.Replace(value)
}

func sanitizeEmpresaLineValue(value string) string {
	value = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, value)
	return strings.Join(strings.Fields(value), " ")
}

func sanitizeEmpresaLongValue(value string) string {
	value = strings.Map(func(r rune) rune {
		if (r < 32 && r != '\n' && r != '\t') || r == 127 {
			return -1
		}
		return r
	}, value)
	return strings.TrimSpace(value)
}

func inferEmpresaName(summary string) string {
	firstLine := strings.TrimSpace(strings.SplitN(summary, "\n", 2)[0])
	beforeColon, _, ok := strings.Cut(firstLine, ":")
	if !ok {
		return ""
	}
	beforeColon = sanitizeEmpresaLineValue(beforeColon)
	words := strings.Fields(beforeColon)
	if len(words) == 0 || len(words) > 8 {
		return ""
	}
	return beforeColon
}

func canonicalEmpresaSegment(segment string) string {
	raw := strings.ToLower(sanitizeEmpresaLineValue(segment))
	if v, ok := empresaMemorySegmentAliases[raw]; ok {
		return v
	}
	if raw == "" {
		return "servicos"
	}
	return raw
}

func empresaSegmentLines(segment, summary string) []string {
	switch segment {
	case "saude":
		return []string{
			"Canal de agendamento: WhatsApp e agenda informados no discovery; detalhar com Catarina",
			"Especialidades: " + fallbackText(summary, "a detalhar com Catarina"),
			"Convênios aceitos: a detalhar com Catarina",
		}
	case "alimentacao":
		return []string{
			"Cardápio: a detalhar com Catarina",
			"Delivery próprio: a detalhar com Catarina",
			"Plataformas de delivery: a detalhar com Catarina",
		}
	case "varejo":
		return []string{
			"Catálogo: a detalhar com Catarina",
			"Política de troca: a detalhar com Catarina",
			"Faz entrega: a detalhar com Catarina",
		}
	case "beleza":
		return []string{
			"Canal de agendamento: WhatsApp e agenda informados no discovery; detalhar com Catarina",
			"Lista de serviços: " + fallbackText(summary, "a detalhar com Catarina"),
		}
	case "educacao":
		return []string{
			"Cursos oferecidos: a detalhar com Catarina",
			"Como faz matrícula: a detalhar com Catarina",
		}
	case "imobiliaria":
		return []string{
			"Tipos de imóvel: a detalhar com Catarina",
			"Como agenda visita: a detalhar com Catarina",
		}
	default:
		return []string{
			"Como gera orçamento: a detalhar com Catarina",
			"Prazo padrão: a detalhar com Catarina",
		}
	}
}

func recomputeOnboardingStateBlockers(state map[string]any, empresaFilled bool) {
	discovery := mapField(state, "discovery")
	owner := mapField(state, "owner_captured")
	deepening := mapField(state, "deepening")
	promotion := mapField(state, "promotion")
	state["promotion"] = promotion

	blocked := []string{}
	if stringField(discovery, "completed_at") == "" {
		blocked = append(blocked, "discovery_incomplete")
	}
	if stringField(owner, "email") == "" {
		blocked = append(blocked, "owner_email_missing")
	}
	if stringField(owner, "whatsapp") == "" {
		blocked = append(blocked, "owner_whatsapp_missing")
	}
	covered := stringSet(sliceField(deepening, "areas_covered"))
	missing := []string{}
	for _, required := range sliceField(deepening, "areas_required") {
		if _, ok := covered[required]; !ok {
			missing = append(missing, required)
		}
	}
	if len(missing) > 0 {
		blocked = append(blocked, "deepening_incomplete: "+strings.Join(missing, ","))
	}
	if !empresaFilled {
		blocked = append(blocked, "empresa_memory_empty: memory/empresa.md is not filled")
	}

	promotion["blocked_by"] = blocked
	promotedAt := stringField(promotion, "promoted_at")
	ready := len(blocked) == 0 && promotedAt == ""
	promotion["ready"] = ready
	switch {
	case promotedAt != "":
		state["phase"] = "promoted"
	case ready:
		state["phase"] = "ready_for_promotion"
	case len(covered) > 0:
		state["phase"] = "deepening_in_progress"
	case stringField(discovery, "completed_at") != "":
		state["phase"] = "discovery_done"
	default:
		state["phase"] = "discovery_in_progress"
	}
}

func stringField(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func mapField(m map[string]any, key string) map[string]any {
	if child, ok := m[key].(map[string]any); ok {
		return child
	}
	child := map[string]any{}
	m[key] = child
	return child
}

func sliceField(m map[string]any, key string) []string {
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func stringSet(items []string) map[string]struct{} {
	out := make(map[string]struct{}, len(items))
	for _, item := range items {
		out[item] = struct{}{}
	}
	return out
}

func fallbackText(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
