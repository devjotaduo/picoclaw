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
	IntakeLLMModel   string

	// ClaraModel is the LiteLLM model name used by the conversational agent
	// on /api/v1/public/company-intakes/{id}/chat. Defaults to claude-sonnet-4.6
	// because it handles casual Portuguese best; overridable via env.
	ClaraModel string
	// ClaraMaxTurns hard-caps a single intake's chat history to prevent runaway
	// token spend. Default 120 (≈ 60 user + 60 assistant turns) — Sofia uses
	// segment-aware playbooks and the conversation typically runs 20-40 turns
	// before mark_qualified.
	ClaraMaxTurns int
	// ClaraRateLimitPerIP / ClaraRateWindow set the per-IP rate limit for the
	// chat endpoint (messages per window). Default 30 / 10min.
	ClaraRateLimitPerIP int
	ClaraRateWindow     time.Duration
	// ClaraEnabled flips the public chat endpoint on. The legacy script-driven
	// flow stays available regardless so we can A/B compare.
	ClaraEnabled bool

	TenantImage        string
	TenantBaseDomain   string
	TenantHostDataDir  string
	TenantTemplateDir  string // optional: copied into every new tenant volume before container start
	TenantProfileDir   string // stores centrally managed launcher profile seed directories
	TenantNetworkEdge  string
	TenantNetworkLLM   string
	TenantCertResolver string // empty = no resolver label (Traefik falls back to default cert)

	CompanyIntakeUploadDir string

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

	// Auto-provision: when enabled, mark_qualified on a Clara chat triggers
	// tenant creation + Supabase user creation automatically. Default off so
	// the existing manual flow stays unchanged.
	AutoProvisionEnabled  bool
	AutoProvisionProfile  string // launcher profile id seeded on new tenant
	AutoProvisionPerIPDay int    // max auto-provisions per client IP per 24h
	// AutoProvisionWorkspaceDir, when set, points to a local directory whose
	// contents are overlaid into the new tenant's <volume>/workspace/ AFTER
	// the profile seed runs. Lets the operator point auto-provision at e.g.
	// workspace-assistente/ so new tenants get the Sofia agent files they
	// have been editing locally instead of the profile's frozen copy.
	// Per-tenant runtime state (sessions, memory, whatsapp/matrix state) is
	// preserved by the overlay skip list — only agent definition files get
	// overwritten.
	AutoProvisionWorkspaceDir string

	// Supabase Auth — used as the source of truth for tenant dashboard logins
	// when tenant.auth_backend = 'supabase'. The controlplane verifies the
	// JWT and continues signing trusted_gateway HMAC headers to the launcher.
	SupabaseProjectRef     string
	SupabaseAnonKey        string
	SupabaseServiceRoleKey string
	SupabaseJWTSecret      string
	SupabaseSiteURL        string
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
		IntakeLLMModel:      os.Getenv("COMPANY_INTAKE_LLM_MODEL"),
		// Default to a model already registered in the production LiteLLM config
		// (claude-sonnet-4-5 is mapped to openrouter/anthropic/claude-sonnet-4.5
		// in deploy/litellm/config.yaml). Override via env when bumping the upstream.
		ClaraModel:          envOr("CLARA_MODEL", "claude-sonnet-4-5"),
		ClaraMaxTurns:       envInt("CLARA_MAX_TURNS", 120), // up to ~60 user turns × 2 roles
		ClaraRateLimitPerIP: envInt("CLARA_RATE_LIMIT_PER_IP", 30),
		ClaraRateWindow:     time.Duration(envInt("CLARA_RATE_WINDOW_SECONDS", 600)) * time.Second,
		ClaraEnabled:        envBool("CLARA_ENABLED", true),
		TenantImage:         envOr("TENANT_IMAGE", "picoclaw-launcher:latest"),
		TenantBaseDomain:    os.Getenv("TENANT_BASE_DOMAIN"),
		TenantHostDataDir:   envOr("TENANT_HOST_DATA_DIR", "/srv/saas/tenants"),
		TenantTemplateDir:   os.Getenv("TENANT_TEMPLATE_DIR"),
		TenantProfileDir:    envOr("TENANT_PROFILE_DIR", "/var/lib/picoclaw-saas/launcher-profiles"),
		TenantNetworkEdge:   envOr("TENANT_NETWORK_EDGE", "saas_edge"),
		TenantNetworkLLM:    envOr("TENANT_NETWORK_LLM", "saas_llm"),
		TenantCertResolver:  envOr("TENANT_CERT_RESOLVER", "letsencrypt"),
		CompanyIntakeUploadDir: envOr(
			"COMPANY_INTAKE_UPLOAD_DIR",
			"/var/lib/picoclaw-saas/company-intakes/uploads",
		),
		CookieDomain: os.Getenv("COOKIE_DOMAIN"),
		CookieSecure: envBool("COOKIE_SECURE", true),
		OpenCRMURL:   envOr("OPENCRM_URL", "http://opencrm:8787"),
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

	c.AutoProvisionEnabled = envBool("PICOCLAW_SAAS_AUTO_PROVISION", false)
	c.AutoProvisionProfile = envOr("PICOCLAW_SAAS_AUTO_PROVISION_PROFILE", "default-business")
	c.AutoProvisionPerIPDay = envInt("PICOCLAW_SAAS_AUTO_PROVISION_PER_IP_DAY", 3)
	c.AutoProvisionWorkspaceDir = os.Getenv("PICOCLAW_SAAS_AUTO_PROVISION_WORKSPACE_DIR")

	c.SupabaseProjectRef = os.Getenv("SUPABASE_PROJECT_REF")
	c.SupabaseAnonKey = os.Getenv("SUPABASE_ANON_KEY")
	c.SupabaseServiceRoleKey = os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	c.SupabaseJWTSecret = os.Getenv("SUPABASE_JWT_SECRET")
	c.SupabaseSiteURL = envOr("SUPABASE_SITE_URL", "https://"+c.TenantBaseDomain)

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
