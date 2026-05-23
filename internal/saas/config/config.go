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

	TenantImage        string
	TenantBaseDomain   string
	TenantHostDataDir  string
	TenantNetworkEdge  string
	TenantNetworkLLM   string
	TenantCertResolver string // empty = no resolver label (Traefik falls back to default cert)

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

	// BrowserCDPURL is the Chrome DevTools Protocol endpoint of the shared
	// browser-sidecar service, propagated to every tenant container so the
	// `agent-browser` Node CLI inside the tenant can connect remotely instead
	// of trying to launch its own Chromium. Defaults to the compose service
	// name on saas_llm. Setting this to empty disables the env var entirely
	// (skill will refuse to run with a clear error).
	BrowserCDPURL string

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
}

func Load() (*Config, error) {
	c := &Config{
		ListenAddr:          envOr("LISTEN_ADDR", ":8080"),
		PGDSN:               os.Getenv("PG_DSN"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		GatewaySharedSecret: os.Getenv("PICOCLAW_SAAS_GATEWAY_SECRET"),
		DockerHost:          envOr("DOCKER_HOST", "unix:///var/run/docker.sock"),
		LiteLLMURL:         os.Getenv("LITELLM_URL"),
		LiteLLMMasterKey:   os.Getenv("LITELLM_MASTER_KEY"),
		TenantImage:        envOr("TENANT_IMAGE", "picoclaw-launcher:latest"),
		TenantBaseDomain:   os.Getenv("TENANT_BASE_DOMAIN"),
		TenantHostDataDir:  envOr("TENANT_HOST_DATA_DIR", "/srv/saas/tenants"),
		TenantNetworkEdge:  envOr("TENANT_NETWORK_EDGE", "saas_edge"),
		TenantNetworkLLM:   envOr("TENANT_NETWORK_LLM", "saas_llm"),
		TenantCertResolver: envOr("TENANT_CERT_RESOLVER", "letsencrypt"),
		CookieDomain:       os.Getenv("COOKIE_DOMAIN"),
		CookieSecure:  envBool("COOKIE_SECURE", true),
		OpenCRMURL:    envOr("OPENCRM_URL", "http://opencrm:8787"),
		BrowserCDPURL: envOr("BROWSER_CDP_URL", "http://browser-sidecar:9222"),
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

	c.SupabaseProjectRef = os.Getenv("SUPABASE_PROJECT_REF")
	c.SupabaseAnonKey = os.Getenv("SUPABASE_ANON_KEY")
	c.SupabaseServiceRoleKey = os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	c.SupabaseJWTSecret = os.Getenv("SUPABASE_JWT_SECRET")
	c.SupabaseSiteURL = envOr("SUPABASE_SITE_URL", "https://"+c.TenantBaseDomain)

	c.MCPEncryptionKey = os.Getenv("PICOCLAW_SAAS_MCP_ENCRYPTION_KEY")

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
