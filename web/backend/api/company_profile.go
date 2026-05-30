package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/config"
)

type companyProfileFieldStatus string

const (
	companyProfileFieldMissing   companyProfileFieldStatus = "missing"
	companyProfileFieldPending   companyProfileFieldStatus = "pending"
	companyProfileFieldFilled    companyProfileFieldStatus = "filled"
	companyProfileFieldValidated companyProfileFieldStatus = "validated"
)

type companyProfileFieldDef struct {
	ID            string
	GroupID       string
	Label         string
	Description   string
	File          string
	MarkdownLabel string
	Aliases       []companyProfileFieldAlias
	Kind          string
	Required      bool
	Agents        []string
	Options       []string
}

type companyProfileFieldAlias struct {
	File          string
	MarkdownLabel string
	WholeDocument bool
}

type companyProfileGroupDef struct {
	ID          string
	Title       string
	Description string
}

type companyProfileField struct {
	ID            string                    `json:"id"`
	GroupID       string                    `json:"group_id"`
	Label         string                    `json:"label"`
	Description   string                    `json:"description"`
	Source        string                    `json:"source"`
	MarkdownLabel string                    `json:"markdown_label"`
	Kind          string                    `json:"kind"`
	Value         string                    `json:"value"`
	Required      bool                      `json:"required"`
	Status        companyProfileFieldStatus `json:"status"`
	Agents        []string                  `json:"agents"`
	Options       []string                  `json:"options,omitempty"`
}

type companyProfileGroup struct {
	ID          string                `json:"id"`
	Title       string                `json:"title"`
	Description string                `json:"description"`
	Total       int                   `json:"total"`
	Completed   int                   `json:"completed"`
	Missing     int                   `json:"missing"`
	Fields      []companyProfileField `json:"fields"`
}

type companyProfileResponse struct {
	Workspace   string                `json:"workspace"`
	GeneratedAt string                `json:"generated_at"`
	Total       int                   `json:"total"`
	Completed   int                   `json:"completed"`
	Missing     int                   `json:"missing"`
	Groups      []companyProfileGroup `json:"groups"`
}

type companyProfileSaveRequest struct {
	Fields map[string]string `json:"fields"`
}

type companyProfileSaveResponse struct {
	Workspace   string            `json:"workspace"`
	UpdatedAt   string            `json:"updated_at"`
	Updated     int               `json:"updated"`
	BackupPaths map[string]string `json:"backup_paths,omitempty"`
}

const (
	maxCompanyProfileBodyBytes  = 128 * 1024
	maxCompanyProfileFieldBytes = 16 * 1024
)

var companyProfileGroups = []companyProfileGroupDef{
	{
		ID:          "empresa",
		Title:       "Empresa",
		Description: "Identidade, oferta principal e dados públicos que todos os agentes podem usar.",
	},
	{
		ID:          "comercial",
		Title:       "Comercial",
		Description: "Preços, planos, pagamentos e limites para conversas de venda.",
	},
	{
		ID:          "atendimento",
		Title:       "Atendimento",
		Description: "Perguntas frequentes, canais e respostas aprovadas para o contato inicial.",
	},
	{
		ID:          "suporte",
		Title:       "Suporte",
		Description: "SLA, políticas e situações que precisam escalar para humano.",
	},
	{
		ID:          "marketing",
		Title:       "Marketing",
		Description: "Tom de marca, ofertas e restrições para publicações e campanhas.",
	},
	{
		ID:          "limites",
		Title:       "Limites",
		Description: "Regras para evitar invenção, exposição indevida ou decisões sem validação.",
	},
}

var companyProfileFieldCatalog = []companyProfileFieldDef{
	{
		ID:            "company_name",
		GroupID:       "empresa",
		Label:         "Nome da empresa",
		Description:   "Nome real usado nas apresentações, mensagens e documentos.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Nome",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Nome da empresa"},
		},
		Kind:     "text",
		Required: true,
		Agents:   []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "segment",
		GroupID:       "empresa",
		Label:         "Segmento",
		Description:   "Tipo de negócio, como clínica, loja, restaurante, imobiliária ou serviço local.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Segmento",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Segmento"},
		},
		Kind:     "text",
		Required: true,
		Agents:   []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "detected_segment",
		GroupID:       "empresa",
		Label:         "Segmento confirmado pela Sofia",
		Description:   "Confirmação usada para liberar perguntas e automações específicas do negócio.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Segmento detectado",
		Kind:          "text",
		Agents:        []string{"Sofia"},
	},
	{
		ID:            "description",
		GroupID:       "empresa",
		Label:         "Descrição curta",
		Description:   "Resumo objetivo do que a empresa faz, sem promessa exagerada.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Descrição",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Descrição curta"},
		},
		Kind:     "textarea",
		Required: true,
		Agents:   []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "products_services",
		GroupID:       "empresa",
		Label:         "Produtos ou serviços",
		Description:   "Lista do que pode ser oferecido, explicado ou encaminhado ao cliente.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Produtos ou serviços",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Produtos ou serviços"},
		},
		Kind:     "textarea",
		Required: true,
		Agents:   []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "business_hours",
		GroupID:       "empresa",
		Label:         "Horário de atendimento",
		Description:   "Quando responder, quando prometer retorno e quando avisar indisponibilidade.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Horário",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Horário de funcionamento"},
		},
		Kind:     "textarea",
		Required: true,
		Agents:   []string{"Sofia", "Clara"},
	},
	{
		ID:            "address",
		GroupID:       "empresa",
		Label:         "Endereço",
		Description:   "Local físico, cidade ou referência pública autorizada.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Endereço",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Endereço"},
		},
		Kind:   "text",
		Agents: []string{"Sofia", "Clara"},
	},
	{
		ID:            "service_regions",
		GroupID:       "empresa",
		Label:         "Regiões atendidas",
		Description:   "Cidades, bairros ou áreas em que a empresa pode atender.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Regiões atendidas",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Regiões atendidas"},
		},
		Kind:   "textarea",
		Agents: []string{"Sofia", "Clara", "Marcos"},
	},
	{
		ID:            "site",
		GroupID:       "empresa",
		Label:         "Site",
		Description:   "URL pública que os agentes podem indicar.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Site",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Site"},
		},
		Kind:   "text",
		Agents: []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "instagram",
		GroupID:       "empresa",
		Label:         "Instagram",
		Description:   "Perfil público autorizado para indicação e criação de conteúdo.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Instagram",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Instagram"},
		},
		Kind:   "text",
		Agents: []string{"Sofia", "Marcos", "Camila"},
	},
	{
		ID:            "whatsapp",
		GroupID:       "empresa",
		Label:         "WhatsApp principal",
		Description:   "Número público para atendimento ou encaminhamento.",
		File:          "memory/empresa.md",
		MarkdownLabel: "WhatsApp",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "WhatsApp"},
		},
		Kind:   "text",
		Agents: []string{"Sofia", "Clara"},
	},
	{
		ID:            "can_quote_price",
		GroupID:       "comercial",
		Label:         "Pode falar preço?",
		Description:   "Define se o agente pode informar valores ou deve encaminhar para humano.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Pode informar preço",
		Aliases: []companyProfileFieldAlias{
			{File: "memory/empresa.md", MarkdownLabel: "Pode falar preço"},
		},
		Kind:     "select",
		Required: true,
		Agents:   []string{"Sofia", "Clara"},
		Options:  []string{"Sim", "Não", "Somente faixa aprovada"},
	},
	{
		ID:            "price_range",
		GroupID:       "comercial",
		Label:         "Faixa de preço aprovada",
		Description:   "Valores, condições ou orientação comercial que podem ser ditos.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Faixa de preço",
		Aliases: []companyProfileFieldAlias{
			{File: "memory/empresa.md", MarkdownLabel: "Faixa de preço"},
		},
		Kind:   "textarea",
		Agents: []string{"Sofia", "Clara"},
	},
	{
		ID:            "payment_methods",
		GroupID:       "comercial",
		Label:         "Formas de pagamento",
		Description:   "Pix, cartão, boleto, parcelamento, recorrência ou regras específicas.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Formas de pagamento",
		Aliases: []companyProfileFieldAlias{
			{File: "memory/empresa.md", MarkdownLabel: "Formas de pagamento"},
		},
		Kind:   "textarea",
		Agents: []string{"Sofia", "Clara"},
	},
	{
		ID:            "plans",
		GroupID:       "comercial",
		Label:         "Planos ou pacotes",
		Description:   "Nomes, diferenças e critérios para recomendar planos.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Planos",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara"},
	},
	{
		ID:            "discounts",
		GroupID:       "comercial",
		Label:         "Descontos autorizados",
		Description:   "Regras de desconto, cupons ou condição em que o agente deve pedir validação.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Descontos autorizados",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara"},
	},
	{
		ID:            "implementation_deadline",
		GroupID:       "comercial",
		Label:         "Prazo de implantação ou entrega",
		Description:   "Prazos que podem ser prometidos com segurança.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Prazo de implantação",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara"},
	},
	{
		ID:            "faq",
		GroupID:       "atendimento",
		Label:         "Perguntas frequentes",
		Description:   "Perguntas e respostas recorrentes que devem ser usadas como referência.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Perguntas frequentes",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara"},
	},
	{
		ID:            "objections",
		GroupID:       "atendimento",
		Label:         "Objeções e respostas",
		Description:   "Dúvidas, recusas e comparações que o agente pode responder sem inventar.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Objeções e respostas",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara"},
	},
	{
		ID:            "official_channels",
		GroupID:       "atendimento",
		Label:         "Canais oficiais",
		Description:   "Canais públicos da empresa que podem ser indicados ao cliente.",
		File:          "config/authorized-channels.md",
		MarkdownLabel: "Canais oficiais",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara", "Camila"},
	},
	{
		ID:            "authorized_channels",
		GroupID:       "atendimento",
		Label:         "Canais autorizados para atendimento",
		Description:   "WhatsApp, Instagram, grupos ou caixas de entrada liberadas para operação.",
		File:          "config/authorized-channels.md",
		MarkdownLabel: "Canais autorizados",
		Aliases: []companyProfileFieldAlias{
			{File: "config/authorized-channels.md", WholeDocument: true},
		},
		Kind:     "textarea",
		Required: true,
		Agents:   []string{"Sofia", "Clara"},
	},
	{
		ID:            "sla",
		GroupID:       "suporte",
		Label:         "SLA de atendimento",
		Description:   "Tempo esperado de resposta, solução ou retorno humano.",
		File:          "config/company-profile.md",
		MarkdownLabel: "SLA de atendimento",
		Kind:          "textarea",
		Agents:        []string{"Clara"},
	},
	{
		ID:            "refund_policy",
		GroupID:       "suporte",
		Label:         "Política de troca ou reembolso",
		Description:   "Condições permitidas e quando o agente deve escalar.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Política de troca ou reembolso",
		Kind:          "textarea",
		Agents:        []string{"Clara", "Sofia"},
	},
	{
		ID:            "serious_cases",
		GroupID:       "suporte",
		Label:         "Casos graves",
		Description:   "Situações sensíveis, urgentes ou de risco que exigem cuidado especial.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Casos graves",
		Kind:          "textarea",
		Agents:        []string{"Clara", "Sofia"},
	},
	{
		ID:            "human_escalation",
		GroupID:       "suporte",
		Label:         "Quando chamar humano",
		Description:   "Critérios objetivos para transferir, pausar ou pedir validação.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Quando chamar humano",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Quando chamar humano"},
		},
		Kind:     "textarea",
		Required: true,
		Agents:   []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "brand_tone",
		GroupID:       "marketing",
		Label:         "Tom de marca",
		Description:   "Como a marca fala: formal, próxima, técnica, premium, simples ou divertida.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Tom de marca",
		Kind:          "textarea",
		Agents:        []string{"Marcos", "Camila", "Sofia"},
	},
	{
		ID:            "offers",
		GroupID:       "marketing",
		Label:         "Ofertas ativas",
		Description:   "Promoções, campanhas ou ofertas que podem ser publicadas ou mencionadas.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Ofertas ativas",
		Kind:          "textarea",
		Agents:        []string{"Marcos", "Camila", "Sofia"},
	},
	{
		ID:            "calendar",
		GroupID:       "marketing",
		Label:         "Calendário comercial",
		Description:   "Datas relevantes, sazonalidades, eventos ou períodos de campanha.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Calendário comercial",
		Kind:          "textarea",
		Agents:        []string{"Marcos", "Camila"},
	},
	{
		ID:            "highlighted_products",
		GroupID:       "marketing",
		Label:         "Produtos em destaque",
		Description:   "Itens, serviços ou linhas que devem ganhar prioridade em posts e abordagens.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Produtos em destaque",
		Kind:          "textarea",
		Agents:        []string{"Marcos", "Camila", "Sofia"},
	},
	{
		ID:            "publication_restrictions",
		GroupID:       "marketing",
		Label:         "Restrições de publicação",
		Description:   "Assuntos, imagens, promessas ou dados que não podem aparecer em conteúdo.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Restrições de publicação",
		Kind:          "textarea",
		Agents:        []string{"Marcos", "Camila"},
	},
	{
		ID:            "never_invent",
		GroupID:       "limites",
		Label:         "Informações que nunca podem ser inventadas",
		Description:   "Preço, prazo, disponibilidade, diagnóstico, garantia ou qualquer dado crítico.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Informações que nunca podem ser inventadas",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Informações que o agente nunca pode errar"},
		},
		Kind:     "textarea",
		Required: true,
		Agents:   []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "prohibited_info",
		GroupID:       "limites",
		Label:         "Informações proibidas de falar",
		Description:   "Dados internos, segredos, credenciais, margens, informações pessoais ou políticas privadas.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Informações proibidas de falar",
		Aliases: []companyProfileFieldAlias{
			{File: "config/company-profile.md", MarkdownLabel: "Informações proibidas de falar"},
		},
		Kind:     "textarea",
		Required: true,
		Agents:   []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "sensitive_data",
		GroupID:       "limites",
		Label:         "Dados sensíveis",
		Description:   "Como coletar, evitar ou escalar dados pessoais, financeiros, médicos ou documentos.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Dados sensíveis",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara"},
	},
	{
		ID:            "human_validation",
		GroupID:       "limites",
		Label:         "O que exige validação humana",
		Description:   "Casos em que o agente deve pedir revisão antes de responder ou publicar.",
		File:          "config/company-profile.md",
		MarkdownLabel: "Validação humana obrigatória",
		Kind:          "textarea",
		Agents:        []string{"Sofia", "Clara", "Marcos", "Camila"},
	},
	{
		ID:            "information_status",
		GroupID:       "limites",
		Label:         "Status da informação",
		Description:   "Indica se os dados já foram revisados por uma pessoa responsável.",
		File:          "memory/empresa.md",
		MarkdownLabel: "Status da informação",
		Kind:          "select",
		Required:      true,
		Agents:        []string{"Sofia", "Clara", "Marcos", "Camila"},
		Options:       []string{"pendente de validação", "validado"},
	},
}

func (h *Handler) registerCompanyProfileRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/company-profile", h.handleGetCompanyProfile)
	mux.HandleFunc("PUT /api/workspace/company-profile", h.handlePutCompanyProfile)
}

func (h *Handler) handleGetCompanyProfile(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	response, err := buildCompanyProfileResponse(cfg.WorkspacePath(), time.Now())
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load company profile: %v", err), http.StatusInternalServerError)
		return
	}
	writeJSON(w, response)
}

func (h *Handler) handlePutCompanyProfile(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxCompanyProfileBodyBytes+1))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read request body: %v", err), http.StatusBadRequest)
		return
	}
	if len(body) > maxCompanyProfileBodyBytes {
		http.Error(
			w,
			fmt.Sprintf("company profile payload exceeds %d bytes", maxCompanyProfileBodyBytes),
			http.StatusRequestEntityTooLarge,
		)
		return
	}
	var req companyProfileSaveRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	result, err := saveCompanyProfileFields(cfg.WorkspacePath(), req.Fields, time.Now())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, result)
}

func buildCompanyProfileResponse(workspace string, now time.Time) (companyProfileResponse, error) {
	fileContent := make(map[string]string)
	for _, field := range companyProfileFieldCatalog {
		files := []string{field.File}
		for _, alias := range field.Aliases {
			files = append(files, alias.File)
		}
		for _, relFile := range files {
			if _, ok := fileContent[relFile]; ok {
				continue
			}
			content, err := readWorkspaceTextFile(workspace, filepath.FromSlash(relFile))
			if err != nil {
				return companyProfileResponse{}, err
			}
			fileContent[relFile] = content
		}
	}

	fieldsByGroup := make(map[string][]companyProfileField)
	for _, def := range companyProfileFieldCatalog {
		value := companyProfileValueForDef(fileContent, def)
		status := companyProfileStatusForValue(def, value)
		fieldsByGroup[def.GroupID] = append(fieldsByGroup[def.GroupID], companyProfileField{
			ID:            def.ID,
			GroupID:       def.GroupID,
			Label:         def.Label,
			Description:   def.Description,
			Source:        filepath.ToSlash(def.File),
			MarkdownLabel: def.MarkdownLabel,
			Kind:          def.Kind,
			Value:         value,
			Required:      def.Required,
			Status:        status,
			Agents:        append([]string(nil), def.Agents...),
			Options:       append([]string(nil), def.Options...),
		})
	}

	groups := make([]companyProfileGroup, 0, len(companyProfileGroups))
	total := 0
	completed := 0
	for _, groupDef := range companyProfileGroups {
		fields := fieldsByGroup[groupDef.ID]
		groupCompleted := 0
		for _, field := range fields {
			total++
			if field.Status != companyProfileFieldMissing && field.Status != companyProfileFieldPending {
				groupCompleted++
				completed++
			}
		}
		groups = append(groups, companyProfileGroup{
			ID:          groupDef.ID,
			Title:       groupDef.Title,
			Description: groupDef.Description,
			Total:       len(fields),
			Completed:   groupCompleted,
			Missing:     len(fields) - groupCompleted,
			Fields:      fields,
		})
	}

	return companyProfileResponse{
		Workspace:   "workspace",
		GeneratedAt: now.Format(time.RFC3339),
		Total:       total,
		Completed:   completed,
		Missing:     total - completed,
		Groups:      groups,
	}, nil
}

func saveCompanyProfileFields(
	workspace string,
	updates map[string]string,
	now time.Time,
) (companyProfileSaveResponse, error) {
	if len(updates) == 0 {
		return companyProfileSaveResponse{
			Workspace: "workspace",
			UpdatedAt: now.UTC().Format(time.RFC3339),
			Updated:   0,
		}, nil
	}

	defsByID := make(map[string]companyProfileFieldDef, len(companyProfileFieldCatalog))
	for _, def := range companyProfileFieldCatalog {
		defsByID[def.ID] = def
	}

	type update struct {
		def   companyProfileFieldDef
		value string
	}
	updatesByFile := make(map[string][]update)
	for id, value := range updates {
		def, ok := defsByID[id]
		if !ok {
			return companyProfileSaveResponse{}, fmt.Errorf("unknown company profile field: %s", id)
		}
		if len([]byte(value)) > maxCompanyProfileFieldBytes {
			return companyProfileSaveResponse{}, fmt.Errorf(
				"company profile field %s exceeds %d bytes",
				id,
				maxCompanyProfileFieldBytes,
			)
		}
		updatesByFile[def.File] = append(updatesByFile[def.File], update{def: def, value: strings.TrimSpace(value)})
	}

	backupPaths := make(map[string]string)
	updated := 0
	stamp := now.UTC().Format("20060102-150405")
	for relFile, fileUpdates := range updatesByFile {
		fullPath := filepath.Join(workspace, filepath.FromSlash(relFile))
		if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
			return companyProfileSaveResponse{}, fmt.Errorf("failed to create profile dir: %w", err)
		}
		content, err := os.ReadFile(fullPath)
		if err != nil {
			if os.IsNotExist(err) {
				content = []byte(defaultCompanyProfileFileContent(relFile))
			} else {
				return companyProfileSaveResponse{}, fmt.Errorf("failed to read %s: %w", relFile, err)
			}
		} else {
			backupPath := fullPath + ".bak-" + stamp
			if writeErr := os.WriteFile(backupPath, content, 0o644); writeErr != nil {
				return companyProfileSaveResponse{}, fmt.Errorf("failed to write backup for %s: %w", relFile, writeErr)
			}
			backupPaths[relFile] = relFile + ".bak-" + stamp
		}

		next := string(content)
		for _, fileUpdate := range fileUpdates {
			next = upsertMarkdownLabelValue(next, fileUpdate.def.MarkdownLabel, fileUpdate.value)
			updated++
		}
		if err := os.WriteFile(fullPath, []byte(next), 0o644); err != nil {
			return companyProfileSaveResponse{}, fmt.Errorf("failed to write %s: %w", relFile, err)
		}
	}

	resp := companyProfileSaveResponse{
		Workspace: "workspace",
		UpdatedAt: now.UTC().Format(time.RFC3339),
		Updated:   updated,
	}
	if len(backupPaths) > 0 {
		resp.BackupPaths = backupPaths
	}
	return resp, nil
}

func companyProfileStatusForValue(def companyProfileFieldDef, value string) companyProfileFieldStatus {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if strings.Contains(normalized, "pendente") {
		return companyProfileFieldPending
	}
	if def.ID == "information_status" && strings.Contains(normalized, "validado") {
		return companyProfileFieldValidated
	}
	if !valueLooksReady(value) {
		return companyProfileFieldMissing
	}
	return companyProfileFieldFilled
}

func companyProfileValueForDef(fileContent map[string]string, def companyProfileFieldDef) string {
	value := extractMarkdownLabelValue(fileContent[def.File], def.MarkdownLabel)
	if valueLooksReady(value) {
		return value
	}
	for _, alias := range def.Aliases {
		var candidate string
		if alias.WholeDocument {
			candidate = strings.TrimSpace(fileContent[alias.File])
		} else {
			candidate = extractMarkdownLabelValue(fileContent[alias.File], alias.MarkdownLabel)
		}
		if valueLooksReady(candidate) {
			return candidate
		}
		if value == "" && strings.TrimSpace(candidate) != "" {
			value = candidate
		}
	}
	return value
}

func companyProfileFieldValueMap(workspace string) (map[string]companyProfileField, error) {
	response, err := buildCompanyProfileResponse(workspace, time.Now())
	if err != nil {
		return nil, err
	}
	fields := make(map[string]companyProfileField)
	for _, group := range response.Groups {
		for _, field := range group.Fields {
			fields[field.ID] = field
		}
	}
	return fields, nil
}

func companyProfileCompleted(fields map[string]companyProfileField, ids ...string) bool {
	for _, id := range ids {
		field, ok := fields[id]
		if !ok {
			return false
		}
		if field.Status == companyProfileFieldMissing || field.Status == companyProfileFieldPending {
			return false
		}
	}
	return true
}

func companyProfileAnyCompleted(fields map[string]companyProfileField, ids ...string) bool {
	for _, id := range ids {
		if companyProfileCompleted(fields, id) {
			return true
		}
	}
	return false
}

func extractMarkdownLabelValue(content string, label string) string {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	for index, rawLine := range lines {
		if !markdownLabelMatches(rawLine, label) {
			continue
		}
		_, right, _ := strings.Cut(rawLine, ":")
		if strings.TrimSpace(right) != "" {
			return cleanMarkdownValue(right)
		}
		values := make([]string, 0, 4)
		for next := index + 1; next < len(lines); next++ {
			line := strings.TrimSpace(lines[next])
			if line == "" || strings.HasPrefix(line, "#") || markdownLooksLikeLabelLine(line) {
				break
			}
			values = append(values, cleanMarkdownValue(line))
		}
		return strings.TrimSpace(strings.Join(values, "\n"))
	}
	return ""
}

func upsertMarkdownLabelValue(content string, label string, value string) string {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	replacement := markdownLabelBlock(label, value)
	for index, rawLine := range lines {
		if !markdownLabelMatches(rawLine, label) {
			continue
		}
		end := index + 1
		_, right, _ := strings.Cut(rawLine, ":")
		if strings.TrimSpace(right) == "" {
			for end < len(lines) {
				line := strings.TrimSpace(lines[end])
				if line == "" || strings.HasPrefix(line, "#") || markdownLooksLikeLabelLine(line) {
					break
				}
				end++
			}
		}
		out := make([]string, 0, len(lines)-end+index+len(replacement))
		out = append(out, lines[:index]...)
		out = append(out, replacement...)
		out = append(out, lines[end:]...)
		return strings.TrimRight(strings.Join(out, "\n"), "\n") + "\n"
	}
	if strings.TrimSpace(normalized) == "" {
		return strings.Join(replacement, "\n") + "\n"
	}
	return strings.TrimRight(normalized, "\n") + "\n\n" + strings.Join(replacement, "\n") + "\n"
}

func markdownLabelBlock(label string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return []string{label + ":"}
	}
	if !strings.Contains(value, "\n") {
		return []string{label + ": " + value}
	}
	block := []string{label + ":"}
	for _, rawLine := range strings.Split(value, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}
		block = append(block, "- "+line)
	}
	return block
}

func markdownLabelMatches(line string, label string) bool {
	left, _, ok := strings.Cut(line, ":")
	if !ok {
		return false
	}
	return normalizeMarkdownLabel(left) == normalizeMarkdownLabel(label)
}

func markdownLooksLikeLabelLine(line string) bool {
	left, right, ok := strings.Cut(line, ":")
	if !ok || strings.TrimSpace(left) == "" {
		return false
	}
	if strings.HasPrefix(strings.TrimSpace(line), "-") || strings.HasPrefix(strings.TrimSpace(line), "*") {
		return false
	}
	return len(strings.Fields(left)) <= 8 || strings.TrimSpace(right) == ""
}

func normalizeMarkdownLabel(label string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimSuffix(label, ":")))
}

func cleanMarkdownValue(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "-")
	value = strings.TrimPrefix(value, "*")
	return strings.TrimSpace(value)
}

func defaultCompanyProfileFileContent(relFile string) string {
	switch relFile {
	case "memory/empresa.md":
		return "# Memória da empresa\n\n"
	case "config/authorized-channels.md":
		return "# Canais autorizados\n\n"
	default:
		return "# Perfil da empresa\n\n"
	}
}
