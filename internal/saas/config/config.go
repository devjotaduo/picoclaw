package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	ListenAddr string

	PGDSN string

	JWTSecret           string
	JWTTTL              time.Duration
	SessionTTL          time.Duration
	GatewaySharedSecret string

	DockerHost string

	LiteLLMURL       string
	LiteLLMMasterKey string

	TenantImage       string
	TenantBaseDomain  string
	TenantHostDataDir string
	TenantBackupDir   string // where Delete archives tenant volumes before removing them; empty = no archive
	TenantNetworkEdge string
	TenantNetworkLLM  string

	CookieDomain string
	CookieSecure bool

	OpenCRMURL string

	SMTPHost              string
	SMTPPort              int
	SMTPUsername          string
	SMTPPassword          string
	AlertFrom             string
	AlertTo               string
	AlertDiskThresholdPct float64

	MailerFrom     string
	MailerAdminURL string

	// WorkspaceDir is the host root where selectable Workspaces live. Each
	// subdir contains home/, frontend-src/, frontend-dist/ — the structure
	// the provisioning flow expects. Default /srv/picoclaw-workspaces.
	WorkspaceDir string

	// TurnstileSecretKey is the server-side secret for Cloudflare Turnstile.
	// When set, the controlplane verifies the X-Captcha-Token header on
	// POST /api/public/chat before reverse-proxying to a public tenant. When
	// empty the check is skipped — the tenant's own RequireCaptchaHeader
	// flag still enforces "non-empty token" as defense in depth, but the
	// token itself is not validated against Cloudflare. Get the secret from
	// the Turnstile dashboard; the corresponding site key is used by the
	// frontend widget and is NOT secret.
	TurnstileSecretKey string

	// BrowserCDPURL is the Chrome DevTools Protocol endpoint of the shared
	// browser-sidecar service, propagated to every tenant container so the
	// `agent-browser` Node CLI inside the tenant can connect remotely instead
	// of trying to launch its own Chromium. Defaults to the compose service
	// name on saas_llm. Setting this to empty disables the env var entirely
	// (skill will refuse to run with a clear error).
	BrowserCDPURL string

	// TenantClaudeCliAuthDir is the host directory holding the operator's
	// claude CLI OAuth state ($HOME/.claude subtree populated by running
	// `claude /login` once on the host). When set AND the directory exists,
	// the provisioner bind-mounts it read-only into every tenant container
	// at /root/.claude so workspaces configured with provider="claude-cli"
	// can call the bundled `claude` binary without per-tenant auth.
	//
	// Default empty = feature disabled (no mount, no leak risk). Operator
	// opts in by setting the env var AND running `claude /login` once
	// under HOME=$THIS_DIR. Subsequent token refresh is the host's
	// responsibility — the mount is read-only so the tenant can't rotate.
	// See docs/operations/claude-cli-provider.md for setup.
	TenantClaudeCliAuthDir string

	// TenantCodexCliAuthDir is the codex CLI equivalent of
	// TenantClaudeCliAuthDir: a host directory ($HOME/.codex tree) bind-
	// mounted read-only into tenants at /root/.codex. Used as a fallback
	// provider when claude-cli rate-limits or token expires (model_list
	// entries set fallbacks: ["codex"]; pkg/providers/fallback.go drives
	// the chain). Default empty = feature disabled.
	// See docs/operations/codex-cli-provider.md for setup.
	TenantCodexCliAuthDir string

	// Supabase Auth — used as the source of truth for tenant dashboard logins
	// when tenant.auth_backend = 'supabase'. The controlplane verifies the
	// JWT and continues signing trusted_gateway HMAC headers to the launcher.
	SupabaseProjectRef     string
	SupabaseAnonKey        string
	SupabaseServiceRoleKey string
	SupabaseJWTSecret      string
	SupabaseSiteURL        string

	// MCPEncryptionKey is the base64-encoded 32-byte AES-256-GCM key used to
	// seal per-workspace MCP server credentials at-rest in
	// workspace_mcp_servers.credentials_encrypted. Generate via
	// `openssl rand -base64 32`. When empty, PUT /api/v1/workspaces/{id}/mcp/*
	// returns 503 — the admin cannot activate any MCPs that require creds
	// until this is configured. See internal/saas/mcp/credentials.go.
	MCPEncryptionKey string

	// JotaduoWAURL is the base URL the public-tenant skill
	// `enviar-whatsapp-jotaduo` POSTs to. Defaults to the compose service
	// name on saas_edge (http://jotaduo-wa:18810) since the sidecar lives
	// alongside the controlplane. Threaded into the tenant container env
	// at buildSpec time, but ONLY for IsPublic tenants — cliente tenants
	// must use their own WhatsApp channel after promotion.
	JotaduoWAURL string

	// JotaduoWAHMACSecret is the HMAC-SHA256 secret shared with the
	// jotaduo-wa sidecar. The same value MUST be set as JOTADUO_WA_HMAC_SECRET
	// in the sidecar's env. When empty, the controlplane does not inject
	// the credential into any tenant — the skill in public tenants will
	// fail with a clear error directing operators to wire it up.
	JotaduoWAHMACSecret string
}

func Load() (*Config, error) {
	c := &Config{
		ListenAddr:          envOr("LISTEN_ADDR", ":8080"),
		PGDSN:               os.Getenv("PG_DSN"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		GatewaySharedSecret: os.Getenv("PICOCLAW_SAAS_GATEWAY_SECRET"),
		DockerHost:          envOr("DOCKER_HOST", "unix:///var/run/docker.sock"),
		LiteLLMURL:          os.Getenv("LITELLM_URL"),
		LiteLLMMasterKey:    os.Getenv("LITELLM_MASTER_KEY"),
		TenantImage:         envOr("TENANT_IMAGE", "picoclaw-launcher:latest"),
		TenantBaseDomain:    os.Getenv("TENANT_BASE_DOMAIN"),
		TenantHostDataDir:   envOr("TENANT_HOST_DATA_DIR", "/srv/saas/tenants"),
		TenantBackupDir:     envOr("TENANT_BACKUP_DIR", "/srv/saas/backups/tenants"),
		TenantNetworkEdge:   envOr("TENANT_NETWORK_EDGE", "saas_edge"),
		TenantNetworkLLM:    envOr("TENANT_NETWORK_LLM", "saas_llm"),
		CookieDomain:        os.Getenv("COOKIE_DOMAIN"),
		CookieSecure:        envBool("COOKIE_SECURE", true),
		OpenCRMURL:          envOr("OPENCRM_URL", "http://opencrm:8787"),
		BrowserCDPURL:       envOr("BROWSER_CDP_URL", "http://browser-sidecar:9222"),
	}

	ttlHours := envInt("JWT_TTL_HOURS", 12)
	c.JWTTTL = time.Duration(ttlHours) * time.Hour
	c.SessionTTL = c.JWTTTL
	if c.GatewaySharedSecret == "" {
		c.GatewaySharedSecret = c.JWTSecret
	}

	c.SMTPHost = os.Getenv("SMTP_HOST")
	c.SMTPPort = envInt("SMTP_PORT", 587)
	c.SMTPUsername = os.Getenv("SMTP_USER")
	c.SMTPPassword = os.Getenv("SMTP_PASSWORD")
	c.AlertFrom = os.Getenv("ALERT_FROM")
	c.AlertTo = os.Getenv("ALERT_TO")
	c.AlertDiskThresholdPct = float64(envInt("ALERT_DISK_THRESHOLD_PCT", 85))

	c.MailerFrom = os.Getenv("MAILER_FROM")
	c.MailerAdminURL = os.Getenv("MAILER_ADMIN_URL")
	if c.MailerAdminURL == "" && c.TenantBaseDomain != "" {
		c.MailerAdminURL = "https://adm." + c.TenantBaseDomain
	}

	c.WorkspaceDir = envOr("PICOCLAW_WORKSPACE_DIR", "/srv/picoclaw-workspaces")

	c.TurnstileSecretKey = os.Getenv("TURNSTILE_SECRET_KEY")

	c.SupabaseProjectRef = os.Getenv("SUPABASE_PROJECT_REF")
	c.SupabaseAnonKey = os.Getenv("SUPABASE_ANON_KEY")
	c.SupabaseServiceRoleKey = os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	c.SupabaseJWTSecret = os.Getenv("SUPABASE_JWT_SECRET")
	c.SupabaseSiteURL = envOr("SUPABASE_SITE_URL", "https://"+c.TenantBaseDomain)

	c.MCPEncryptionKey = os.Getenv("PICOCLAW_SAAS_MCP_ENCRYPTION_KEY")

	c.JotaduoWAURL = envOr("PICOCLAW_JOTADUO_WA_URL", "http://jotaduo-wa:18810")
	c.JotaduoWAHMACSecret = os.Getenv("PICOCLAW_JOTADUO_WA_HMAC_SECRET")

	c.TenantClaudeCliAuthDir = os.Getenv("PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR")
	c.TenantCodexCliAuthDir = os.Getenv("PICOCLAW_TENANT_CODEX_CLI_AUTH_DIR")

	if c.PGDSN == "" {
		return nil, fmt.Errorf("PG_DSN is required")
	}
	if c.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if c.GatewaySharedSecret == "" {
		return nil, fmt.Errorf("PICOCLAW_SAAS_GATEWAY_SECRET or JWT_SECRET is required")
	}
	if c.TenantBaseDomain == "" {
		return nil, fmt.Errorf("TENANT_BASE_DOMAIN is required")
	}
	return c, nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func envBool(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}
