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
