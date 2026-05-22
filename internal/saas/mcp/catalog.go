// Package mcp owns the curated catalog of MCP servers we let SaaS admins
// expose to their tenants. The catalog is intentionally hardcoded — adding
// a new MCP is a code change, not a runtime admin action, so we can audit
// every entry (especially around credential handling) at PR-review time.
package mcp

// Entry describes one MCP server admins can activate per workspace.
type Entry struct {
	ID           string
	Name         string
	Vendor       string
	Category     string
	Description  string
	Integrations []string
	Verticals    []string
	Server       ServerSpec
	Credentials  []CredentialField
	Official     bool
	DocsURL      string
	CostTier     string
}

// ServerSpec is the runtime shape of an MCP. Mirrors pkg/config.MCPServerConfig
// minus Enabled (set at activation time) and Env/EnvFile (filled per-tenant
// during provisioning).
type ServerSpec struct {
	Command string
	Args    []string
	Type    string
	URL     string
	EnvKeys []string
}

// CredentialField describes one secret the admin must enter when activating
// the MCP. Each field's Key becomes both the env var name AND the JSON key
// in the encrypted credentials blob stored in workspace_mcp_servers.
type CredentialField struct {
	Key      string
	Label    string
	Help     string
	Required bool
	Secret   bool
}

// Catalog is the curated list. Order here drives display order in the admin.
var Catalog = []Entry{
	{
		ID:           "notion",
		Name:         "Notion",
		Vendor:       "Notion",
		Category:     "knowledge",
		Description:  "Base de conhecimento e FAQ consultáveis pelo agente.",
		Integrations: []string{"knowledge_base", "internal_knowledge_base"},
		Verticals:    []string{"atendente-geral", "suporte-tecnico", "assistente-interno", "atendente-loja"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@notionhq/notion-mcp-server"},
			EnvKeys: []string{"NOTION_API_KEY"},
		},
		Credentials: []CredentialField{
			{Key: "NOTION_API_KEY", Label: "Integration token", Help: "Crie em notion.so/my-integrations e compartilhe as páginas com a integração.", Required: true, Secret: true},
		},
		Official: true,
		DocsURL:  "https://github.com/makenotion/notion-mcp-server",
		CostTier: "free",
	},
	{
		ID:           "tavily-search",
		Name:         "Tavily Web Search",
		Vendor:       "Tavily",
		Category:     "search",
		Description:  "Busca web para fallback quando a base de conhecimento não cobrir a dúvida.",
		Integrations: []string{},
		Verticals:    []string{"atendente-geral", "suporte-tecnico", "vendas-prospec"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "tavily-mcp"},
			EnvKeys: []string{"TAVILY_API_KEY"},
		},
		Credentials: []CredentialField{
			{Key: "TAVILY_API_KEY", Label: "API key", Help: "Obtenha em tavily.com/api. 1000 requests grátis/mês.", Required: true, Secret: true},
		},
		Official: false,
		DocsURL:  "https://github.com/tavily-ai/tavily-mcp",
		CostTier: "metered",
	},
	{
		ID:           "google-calendar",
		Name:         "Google Calendar",
		Vendor:       "Google",
		Category:     "calendar",
		Description:  "Agendar, remarcar e consultar disponibilidade em calendários do Google.",
		Integrations: []string{"calendar"},
		Verticals:    []string{"atendente-clinica", "vendas-prospec"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@cocal/google-calendar-mcp"},
			EnvKeys: []string{"GOOGLE_OAUTH_CREDENTIALS"},
		},
		Credentials: []CredentialField{
			{Key: "GOOGLE_OAUTH_CREDENTIALS", Label: "OAuth credentials JSON", Help: "Cole o JSON inteiro do OAuth 2.0 Client ID do Google Cloud Console.", Required: true, Secret: true},
		},
		Official: false,
		DocsURL:  "https://github.com/nspady/google-calendar-mcp",
		CostTier: "free",
	},
	{
		ID:           "cal-com",
		Name:         "Cal.com",
		Vendor:       "Cal.com",
		Category:     "calendar",
		Description:  "Agendamento multi-profissional (alternativa open-source ao Google Calendar).",
		Integrations: []string{"calendar"},
		Verticals:    []string{"atendente-clinica", "vendas-prospec"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@calcom/mcp"},
			EnvKeys: []string{"CALCOM_API_KEY"},
		},
		Credentials: []CredentialField{
			{Key: "CALCOM_API_KEY", Label: "API key", Help: "Settings → Developer → API keys no app.cal.com.", Required: true, Secret: true},
		},
		Official: true,
		DocsURL:  "https://cal.com/docs/api-reference/v2/introduction",
		CostTier: "free",
	},
	{
		ID:           "hubspot",
		Name:         "HubSpot",
		Vendor:       "HubSpot",
		Category:     "crm",
		Description:  "Criar e atualizar leads, contatos e deals no HubSpot CRM.",
		Integrations: []string{"crm", "sales_pipeline"},
		Verticals:    []string{"vendas-prospec", "atendente-geral", "atendente-loja"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@hubspot/mcp-server"},
			EnvKeys: []string{"HUBSPOT_ACCESS_TOKEN"},
		},
		Credentials: []CredentialField{
			{Key: "HUBSPOT_ACCESS_TOKEN", Label: "Private app token", Help: "Settings → Integrations → Private Apps → Create.", Required: true, Secret: true},
		},
		Official: true,
		DocsURL:  "https://github.com/HubSpot/mcp-server",
		CostTier: "free",
	},
	{
		ID:           "shopify",
		Name:         "Shopify",
		Vendor:       "Shopify",
		Category:     "ecommerce",
		Description:  "Consultar catálogo, estoque, pedidos e status de envio da loja.",
		Integrations: []string{"ecommerce_platform"},
		Verticals:    []string{"atendente-loja"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@shopify/dev-mcp"},
			EnvKeys: []string{"SHOPIFY_ACCESS_TOKEN", "SHOPIFY_SHOP_DOMAIN"},
		},
		Credentials: []CredentialField{
			{Key: "SHOPIFY_SHOP_DOMAIN", Label: "Shop domain", Help: "Ex: minhaloja.myshopify.com (sem https://).", Required: true, Secret: false},
			{Key: "SHOPIFY_ACCESS_TOKEN", Label: "Admin API access token", Help: "Custom app → Configure Admin API scopes → Install.", Required: true, Secret: true},
		},
		Official: true,
		DocsURL:  "https://github.com/Shopify/dev-mcp",
		CostTier: "free",
	},
	{
		ID:           "stripe",
		Name:         "Stripe",
		Vendor:       "Stripe",
		Category:     "payment",
		Description:  "Gerar links de pagamento, consultar transações e clientes no Stripe.",
		Integrations: []string{"payment_gateway"},
		Verticals:    []string{"atendente-loja", "vendas-prospec"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@stripe/mcp", "--tools=all"},
			EnvKeys: []string{"STRIPE_SECRET_KEY"},
		},
		Credentials: []CredentialField{
			{Key: "STRIPE_SECRET_KEY", Label: "Secret key", Help: "Dashboard → Developers → API keys → Secret key. Use sk_test_* para homologação.", Required: true, Secret: true},
		},
		Official: true,
		DocsURL:  "https://docs.stripe.com/mcp",
		CostTier: "metered",
	},
	{
		ID:           "resend",
		Name:         "Resend",
		Vendor:       "Resend",
		Category:     "email",
		Description:  "Envio transacional de emails (confirmações, follow-ups).",
		Integrations: []string{"email"},
		Verticals:    []string{"vendas-prospec", "atendente-clinica", "atendente-loja"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@resend/mcp-send-email"},
			EnvKeys: []string{"RESEND_API_KEY", "SENDER_EMAIL_ADDRESS"},
		},
		Credentials: []CredentialField{
			{Key: "RESEND_API_KEY", Label: "API key", Help: "resend.com → API Keys.", Required: true, Secret: true},
			{Key: "SENDER_EMAIL_ADDRESS", Label: "Email remetente", Help: "Domínio precisa estar verificado no Resend.", Required: true, Secret: false},
		},
		Official: true,
		DocsURL:  "https://github.com/resend/mcp-send-email",
		CostTier: "free",
	},
	{
		ID:           "sentry",
		Name:         "Sentry",
		Vendor:       "Sentry",
		Category:     "log",
		Description:  "Consultar erros e issues para suporte técnico.",
		Integrations: []string{"log_storage", "issue_tracker"},
		Verticals:    []string{"suporte-tecnico"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "@sentry/mcp-server"},
			EnvKeys: []string{"SENTRY_AUTH_TOKEN", "SENTRY_ORG"},
		},
		Credentials: []CredentialField{
			{Key: "SENTRY_AUTH_TOKEN", Label: "Auth token", Help: "User Settings → Auth Tokens (escopo project:read, org:read).", Required: true, Secret: true},
			{Key: "SENTRY_ORG", Label: "Org slug", Help: "Ex: jotaduo (o que aparece em sentry.io/<org>/).", Required: true, Secret: false},
		},
		Official: true,
		DocsURL:  "https://github.com/getsentry/sentry-mcp",
		CostTier: "free",
	},
	{
		ID:           "linear",
		Name:         "Linear",
		Vendor:       "Linear",
		Category:     "issue_tracker",
		Description:  "Abrir tickets de suporte e bugs no Linear.",
		Integrations: []string{"helpdesk", "issue_tracker", "ticketing_system"},
		Verticals:    []string{"suporte-tecnico", "assistente-interno", "atendente-geral"},
		Server: ServerSpec{
			Command: "npx",
			Args:    []string{"-y", "mcp-remote", "https://mcp.linear.app/sse"},
			EnvKeys: []string{},
		},
		Credentials: []CredentialField{},
		Official:    true,
		DocsURL:     "https://linear.app/docs/mcp",
		CostTier:    "free",
	},
}

// Lookup returns the catalog entry with the given ID, or false if not found.
// O(n) — the catalog is tiny and lookup is rare; not worth a map.
func Lookup(id string) (Entry, bool) {
	for _, e := range Catalog {
		if e.ID == id {
			return e, true
		}
	}
	return Entry{}, false
}
