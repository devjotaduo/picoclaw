// Package clara defines the Clara conversational agent for the public
// company-intake flow. It holds the system prompt, the OpenAI-compatible tool
// schemas, and a Tool dispatcher that maps function calls into mutations on
// the `company_intakes` row.
package clara

import (
	_ "embed"
	"encoding/json"
)

//go:embed clara_system.txt
var SystemPrompt string

// ToolName is the canonical name of one of Clara's function-calling tools.
type ToolName string

const (
	ToolSetIdentity      ToolName = "set_identity"
	ToolSetBusiness      ToolName = "set_business"
	ToolSetPain          ToolName = "set_pain"
	ToolSetChannels      ToolName = "set_channels"
	ToolSetSystems       ToolName = "set_systems"
	ToolSetWebPresence   ToolName = "set_web_presence"
	ToolSetCRM           ToolName = "set_crm"
	ToolSetQuoting       ToolName = "set_quoting"
	ToolSetProblemArea   ToolName = "set_problem_area"
	ToolSetSalesMode     ToolName = "set_sales_mode"
	ToolSetAgentPriority ToolName = "set_agent_priority"
	ToolMarkQualified    ToolName = "mark_qualified"
	ToolRequestHandoff   ToolName = "request_handoff"
)

// ToolSpec is the OpenAI-compatible function specification. LiteLLM accepts
// this shape directly in `tools[]` of /chat/completions when sending tools to
// any underlying model (Anthropic, OpenAI, Gemini, etc.).
type ToolSpec struct {
	Type     string       `json:"type"` // always "function"
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

// Tools returns the canonical tool catalog Clara is allowed to call.
// Keep schemas tight: every property the agent could fill should be listed
// so the LLM doesn't fabricate fields the dispatcher won't recognize.
func Tools() []ToolSpec {
	return []ToolSpec{
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetIdentity),
				Description: "Salvar o nome da pessoa e/ou da empresa quando ela se apresenta. " +
					"Não inventa: só preenche o que a pessoa realmente disse.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"contact_name": {"type": "string", "description": "Nome da pessoa que está conversando"},
						"company_name": {"type": "string", "description": "Nome da empresa, se mencionado"}
					}
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetBusiness),
				Description: "Registrar o que a empresa faz: descrição livre + segmentos macro. " +
					"Use quando a pessoa descreve o negócio.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"description": {
							"type": "string",
							"description": "Em uma frase: o que a empresa vende ou faz"
						},
						"segments": {
							"type": "array",
							"items": {"type": "string"},
							"description": "Macro-categorias: 'serviços', 'produtos físicos', 'produtos digitais', 'eventos', 'educação', etc."
						},
						"business_models": {
							"type": "array",
							"items": {"type": "string"},
							"description": "B2C, B2B, marketplace, assinatura, agência, etc."
						}
					},
					"required": ["description"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetPain),
				Description: "Registrar uma dor concreta — a tarefa que mais cansa, a coisa que sempre atrasa. " +
					"Pode ser chamada várias vezes se aparecerem múltiplas dores.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"text": {
							"type": "string",
							"description": "A dor descrita com as palavras da pessoa. Curto, 1-2 frases."
						},
						"urgency": {
							"type": "string",
							"enum": ["low", "medium", "high"],
							"description": "high = é o motivo principal de buscar IA agora; medium = incomoda; low = comentou de passagem"
						}
					},
					"required": ["text"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetChannels),
				Description: "Canais por onde a empresa fala com clientes hoje.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"channels": {
							"type": "array",
							"items": {"type": "string"},
							"description": "Lista normalizada: 'whatsapp', 'instagram', 'telefone', 'site', 'email', 'presencial', 'marketplace'"
						}
					},
					"required": ["channels"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetSystems),
				Description: "Ferramentas/sistemas que a empresa usa no operacional " +
					"(planilha, ERP, CRM, agendamento, marketplace). Pode estar vazia.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"systems": {
							"type": "array",
							"items": {"type": "string"},
							"description": "Nomes informais como 'planilha', 'bling', 'sap', 'sheets', 'cnpj.biz', 'agendamento próprio'"
						},
						"notes": {
							"type": "string",
							"description": "Observação livre se a pessoa der contexto extra"
						}
					}
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetWebPresence),
				Description: "Presença web da empresa: site e Instagram. " +
					"Salve sempre que a pessoa citar URL, @ do Instagram ou disser que não tem.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"website": {
							"type": "string",
							"description": "URL ou domínio (ex.: 'acme.com.br'). Vazio se a pessoa disser que não tem."
						},
						"instagram": {
							"type": "string",
							"description": "@perfil ou URL do Instagram. Vazio se não tem."
						}
					}
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetCRM),
				Description: "Sistema usado pra gerenciar clientes/leads (CRM, agenda, planilha). " +
					"Não pergunte 'qual CRM?' diretamente — pergunte 'usa algum sistema pra gerenciar clientes?'.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"name": {
							"type": "string",
							"description": "Nome informal do sistema (ex.: 'planilha', 'rd station', 'hubspot', 'whatsapp business', 'agenda do google'). Vazio se não usa."
						},
						"notes": {
							"type": "string",
							"description": "Contexto extra se a pessoa der (ex.: 'planilha bem desorganizada')"
						}
					}
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetQuoting),
				Description: "Se a empresa faz orçamento personalizado pra cada cliente (ex.: móveis sob medida, " +
					"obras, eventos). Importante pra Leo (Consultor de Vendas) saber.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"personalized": {
							"type": "boolean",
							"description": "true se cada orçamento é único; false se tem tabela fixa de preços"
						},
						"notes": {
							"type": "string",
							"description": "1 frase resumindo o que muda o preço (m², horas, complexidade, urgência…)"
						}
					},
					"required": ["personalized"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetProblemArea),
				Description: "Onde DÓI hoje — a NATUREZA do gargalo (não o canal). " +
					"Chame quando a pessoa der pistas claras do tipo de problema. " +
					"Use junto com set_pain (que fica com a descrição em texto livre).",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"area": {
							"type": "string",
							"enum": ["vendas", "atendimento", "suporte", "agendamento", "marketing", "gestao"],
							"description": "vendas=fechar negócio/orçamento; atendimento=responder cliente; suporte=pós-venda/dúvida técnica; agendamento=marcar/lembrar consulta/horário; marketing=presença, conteúdo, atrair; gestao=organização interna, follow-up, relatórios"
						},
						"note": {
							"type": "string",
							"description": "1 frase com o detalhe específico do gargalo (ex.: 'perde lead porque demora 1h pra responder no Instagram')"
						}
					},
					"required": ["area"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetSalesMode),
				Description: "Como a empresa vende: vende online ou só presencial, e que tipo de produto/serviço entrega. " +
					"Chame quando a pessoa indicar o modelo de venda — especialmente lojas, restaurantes e produtos.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"online": {
							"type": "boolean",
							"description": "true se vende online (site próprio, marketplace, redes); false se é só presencial/local"
						},
						"product_type": {
							"type": "string",
							"description": "tipo do que entrega — sugerido: 'físico', 'digital', 'serviço', 'agendamento', 'misto'. Pode escrever livre."
						},
						"note": {
							"type": "string",
							"description": "1 frase com o que ela vende em concreto (ex.: 'roupas femininas, vende no Insta e na loja')"
						}
					},
					"required": ["online"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolSetAgentPriority),
				Description: "Qual dos 4 agentes (Ana atendente, Leo vendas, Maya marketing, Sofia secretária do dono) " +
					"a pessoa mais quer focar agora. Chame UMA vez quando descobrir.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"agent": {
							"type": "string",
							"enum": ["ana", "leo", "maya", "sofia"],
							"description": "ana=atendimento, leo=vendas, maya=marketing, sofia=assistente do dono"
						},
						"reason": {
							"type": "string",
							"description": "1 frase do porquê (ex.: 'perde leads no insta sem responder rápido')"
						}
					},
					"required": ["agent"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolMarkQualified),
				Description: "Indica que a Clara já tem informação suficiente para gerar uma proposta " +
					"(negócio + ao menos uma dor + ao menos um canal). Chame apenas UMA vez por sessão.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"reason": {
							"type": "string",
							"description": "Resumo curto (1 frase) de por que está qualificado. Vai para o admin."
						}
					},
					"required": ["reason"]
				}`),
			},
		},
		{
			Type: "function",
			Function: ToolFunction{
				Name: string(ToolRequestHandoff),
				Description: "A pessoa pediu humano, ou o caso é claramente fora do escopo, " +
					"ou demonstrou recusa explícita. Não chame só porque a conversa está difícil — " +
					"é último recurso.",
				Parameters: json.RawMessage(`{
					"type": "object",
					"properties": {
						"reason": {
							"type": "string",
							"description": "Por que o handoff foi requisitado"
						}
					},
					"required": ["reason"]
				}`),
			},
		},
	}
}

// ToolInputIdentity matches set_identity.
type ToolInputIdentity struct {
	ContactName string `json:"contact_name,omitempty"`
	CompanyName string `json:"company_name,omitempty"`
}

// ToolInputBusiness matches set_business.
type ToolInputBusiness struct {
	Description    string   `json:"description"`
	Segments       []string `json:"segments,omitempty"`
	BusinessModels []string `json:"business_models,omitempty"`
}

// ToolInputPain matches set_pain.
type ToolInputPain struct {
	Text    string `json:"text"`
	Urgency string `json:"urgency,omitempty"`
}

// ToolInputChannels matches set_channels.
type ToolInputChannels struct {
	Channels []string `json:"channels"`
}

// ToolInputSystems matches set_systems.
type ToolInputSystems struct {
	Systems []string `json:"systems,omitempty"`
	Notes   string   `json:"notes,omitempty"`
}

// ToolInputMarkQualified matches mark_qualified.
type ToolInputMarkQualified struct {
	Reason string `json:"reason"`
}

// ToolInputRequestHandoff matches request_handoff.
type ToolInputRequestHandoff struct {
	Reason string `json:"reason"`
}

// ToolInputWebPresence matches set_web_presence.
type ToolInputWebPresence struct {
	Website   string `json:"website,omitempty"`
	Instagram string `json:"instagram,omitempty"`
}

// ToolInputCRM matches set_crm.
type ToolInputCRM struct {
	Name  string `json:"name,omitempty"`
	Notes string `json:"notes,omitempty"`
}

// ToolInputQuoting matches set_quoting.
type ToolInputQuoting struct {
	Personalized bool   `json:"personalized"`
	Notes        string `json:"notes,omitempty"`
}

// ToolInputAgentPriority matches set_agent_priority.
type ToolInputAgentPriority struct {
	Agent  string `json:"agent"`
	Reason string `json:"reason,omitempty"`
}

// ToolInputProblemArea matches set_problem_area.
type ToolInputProblemArea struct {
	Area string `json:"area"`
	Note string `json:"note,omitempty"`
}

// ToolInputSalesMode matches set_sales_mode.
type ToolInputSalesMode struct {
	Online      bool   `json:"online"`
	ProductType string `json:"product_type,omitempty"`
	Note        string `json:"note,omitempty"`
}
