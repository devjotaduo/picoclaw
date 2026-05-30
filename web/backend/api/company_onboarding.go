package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/config"
)

type companyOnboardingItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Source      string `json:"source"`
	Completed   bool   `json:"completed"`
}

type companyOnboardingResponse struct {
	Workspace   string                  `json:"workspace"`
	GeneratedAt string                  `json:"generated_at"`
	Total       int                     `json:"total"`
	Completed   int                     `json:"completed"`
	Missing     int                     `json:"missing"`
	Items       []companyOnboardingItem `json:"items"`
}

func (h *Handler) registerCompanyOnboardingRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/company-onboarding", h.handleGetCompanyOnboarding)
}

func (h *Handler) handleGetCompanyOnboarding(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}

	response, err := buildCompanyOnboardingResponse(cfg.WorkspacePath(), time.Now())
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load company onboarding: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(response)
}

func buildCompanyOnboardingResponse(workspace string, now time.Time) (companyOnboardingResponse, error) {
	fields, err := companyProfileFieldValueMap(workspace)
	if err != nil {
		return companyOnboardingResponse{}, err
	}

	items := []companyOnboardingItem{
		{
			ID:          "name",
			Title:       "Nome da empresa",
			Description: "Nome real usado nas apresentações e respostas dos agentes.",
			Source:      "Dados da empresa",
			Completed:   companyProfileCompleted(fields, "company_name"),
		},
		{
			ID:          "segment",
			Title:       "Tipo de negócio",
			Description: "Ex.: loja, clínica ou restaurante.",
			Source:      "Dados da empresa",
			Completed:   companyProfileCompleted(fields, "segment"),
		},
		{
			ID:          "description",
			Title:       "Resumo do que a empresa faz",
			Description: "Explicação curta para os agentes responderem sem inventar.",
			Source:      "Dados da empresa",
			Completed:   companyProfileCompleted(fields, "description"),
		},
		{
			ID:          "products",
			Title:       "Produtos ou serviços",
			Description: "Lista do que pode ser oferecido ou explicado ao cliente.",
			Source:      "Dados da empresa",
			Completed:   companyProfileCompleted(fields, "products_services"),
		},
		{
			ID:          "hours",
			Title:       "Horário de atendimento",
			Description: "Quando os agentes podem orientar o cliente e quando devem pedir retorno.",
			Source:      "Dados da empresa",
			Completed:   companyProfileCompleted(fields, "business_hours"),
		},
		{
			ID:          "location",
			Title:       "Endereço e regiões atendidas",
			Description: "Localização, cidade e área de atendimento sem dados genéricos.",
			Source:      "Dados da empresa",
			Completed:   companyProfileCompleted(fields, "address", "service_regions"),
		},
		{
			ID:          "contacts",
			Title:       "Canais oficiais",
			Description: "WhatsApp, Instagram ou site que os agentes podem indicar ao cliente.",
			Source:      "Dados da empresa",
			Completed:   companyProfileAnyCompleted(fields, "whatsapp", "site", "instagram"),
		},
		{
			ID:          "payment",
			Title:       "Pagamento e preços",
			Description: "Formas de pagamento, permissão para falar preço e faixa aprovada.",
			Source:      "Dados da empresa",
			Completed:   companyProfileCompleted(fields, "payment_methods", "can_quote_price", "price_range"),
		},
		{
			ID:          "human",
			Title:       "Quando chamar uma pessoa",
			Description: "Situações em que o atendimento precisa ir para humano.",
			Source:      "Regras dos agentes",
			Completed:   companyProfileCompleted(fields, "human_escalation"),
		},
		{
			ID:          "limits",
			Title:       "O que não pode inventar",
			Description: "Limites claros para evitar resposta errada, promessa indevida ou dado sensível.",
			Source:      "Regras dos agentes",
			Completed:   companyProfileCompleted(fields, "never_invent", "prohibited_info"),
		},
		{
			ID:          "channels",
			Title:       "Canais autorizados",
			Description: "WhatsApp, Instagram e grupos liberados para atendimento.",
			Source:      "Canais autorizados",
			Completed:   companyProfileCompleted(fields, "authorized_channels"),
		},
		{
			ID:          "detected-segment",
			Title:       "Segmento confirmado pela Sofia",
			Description: "Confirmação que libera perguntas específicas do tipo de negócio.",
			Source:      "Onboarding",
			Completed:   companyProfileCompleted(fields, "detected_segment"),
		},
		{
			ID:          "validated",
			Title:       "Dados validados",
			Description: "Confirmação final de que os agentes já podem usar essas informações.",
			Source:      "Onboarding",
			Completed:   companyProfileCompleted(fields, "information_status"),
		},
	}

	completed := 0
	for _, item := range items {
		if item.Completed {
			completed++
		}
	}

	return companyOnboardingResponse{
		Workspace:   "workspace",
		GeneratedAt: now.Format(time.RFC3339),
		Total:       len(items),
		Completed:   completed,
		Missing:     len(items) - completed,
		Items:       items,
	}, nil
}

func readWorkspaceTextFile(workspace string, parts ...string) (string, error) {
	content, err := os.ReadFile(filepath.Join(append([]string{workspace}, parts...)...))
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(content), nil
}

func lineHasReadyValue(content string, label string) bool {
	label = strings.ToLower(strings.TrimSpace(label))
	for _, rawLine := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		left, right, ok := strings.Cut(rawLine, ":")
		if !ok || strings.ToLower(strings.TrimSpace(left)) != label {
			continue
		}
		return valueLooksReady(right)
	}
	return false
}

func sectionHasReadyValues(content string, heading string) bool {
	section := markdownSection(content, heading)
	if strings.TrimSpace(section) == "" || hasSetupMarker(section) {
		return false
	}
	for _, rawLine := range strings.Split(section, "\n") {
		line := strings.TrimSpace(strings.TrimPrefix(rawLine, "-"))
		if valueLooksReady(line) {
			return true
		}
	}
	return false
}

func documentLooksReady(content string) bool {
	return strings.TrimSpace(content) != "" && !hasSetupMarker(content)
}

func markdownSection(content string, heading string) string {
	normalizedHeading := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(heading, ":")))
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	start := -1
	for index, rawLine := range lines {
		line := strings.TrimSpace(strings.TrimLeft(rawLine, "#"))
		line = strings.TrimSpace(strings.TrimSuffix(line, ":"))
		if strings.ToLower(line) == normalizedHeading {
			start = index + 1
			break
		}
	}
	if start < 0 {
		return ""
	}
	end := len(lines)
	for index := start; index < len(lines); index++ {
		line := strings.TrimSpace(lines[index])
		if line == "" {
			end = index
			break
		}
		if strings.HasPrefix(line, "#") {
			end = index
			break
		}
	}
	return strings.Join(lines[start:end], "\n")
}

func valueLooksReady(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && !hasSetupMarker(value)
}

func hasSetupMarker(value string) bool {
	normalized := strings.ToLower(value)
	markers := []string{
		"[atualizar]",
		"pendente de validação",
		"pendente de validacao",
		"empresa pme brasil",
		"produto ou serviço principal",
		"produto ou servico principal",
		"+55 (11) 9 0000",
		"empresa.com.br",
		"@empresa",
		"r$ [",
		"nome exato",
		"remover se não houver",
		"remover se nao houver",
	}
	for _, marker := range markers {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}
