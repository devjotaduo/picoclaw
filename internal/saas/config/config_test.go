package config

import (
	"strings"
	"testing"
)

// setRequired configures the three env vars required by Load().
// Each individual test can override a specific var via t.Setenv before calling Load().
func setRequired(t *testing.T) {
	t.Helper()
	t.Setenv("PG_DSN", "postgres://test:test@localhost/testdb")
	t.Setenv("JWT_SECRET", "test-secret-32-chars-long-value!")
	t.Setenv("TENANT_BASE_DOMAIN", "example.com")
}

func TestLoad_MissingPGDSN(t *testing.T) {
	setRequired(t)
	t.Setenv("PG_DSN", "")
	_, err := Load()
	if err == nil {
		t.Fatal("want error when PG_DSN is empty")
	}
	if !strings.Contains(err.Error(), "PG_DSN") {
		t.Errorf("error should mention PG_DSN, got: %v", err)
	}
}

func TestLoad_MissingJWTSecret(t *testing.T) {
	setRequired(t)
	t.Setenv("JWT_SECRET", "")
	t.Setenv("PICOCLAW_SAAS_GATEWAY_SECRET", "") // both must be empty to trigger error
	_, err := Load()
	if err == nil {
		t.Fatal("want error when JWT_SECRET is empty")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Errorf("error should mention JWT_SECRET, got: %v", err)
	}
}

func TestLoad_MissingTenantBaseDomain(t *testing.T) {
	setRequired(t)
	t.Setenv("TENANT_BASE_DOMAIN", "")
	_, err := Load()
	if err == nil {
		t.Fatal("want error when TENANT_BASE_DOMAIN is empty")
	}
	if !strings.Contains(err.Error(), "TENANT_BASE_DOMAIN") {
		t.Errorf("error should mention TENANT_BASE_DOMAIN, got: %v", err)
	}
}

func TestLoad_AllRequiredPresent(t *testing.T) {
	setRequired(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PGDSN != "postgres://test:test@localhost/testdb" {
		t.Errorf("PGDSN = %q", cfg.PGDSN)
	}
	if cfg.JWTSecret != "test-secret-32-chars-long-value!" {
		t.Errorf("JWTSecret = %q", cfg.JWTSecret)
	}
	if cfg.TenantBaseDomain != "example.com" {
		t.Errorf("TenantBaseDomain = %q", cfg.TenantBaseDomain)
	}
}

func TestLoad_GatewaySecretFallsBackToJWTSecret(t *testing.T) {
	setRequired(t)
	t.Setenv("PICOCLAW_SAAS_GATEWAY_SECRET", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.GatewaySharedSecret != cfg.JWTSecret {
		t.Errorf("GatewaySharedSecret should equal JWTSecret when PICOCLAW_SAAS_GATEWAY_SECRET unset")
	}
}

func TestLoad_GatewaySecretOverridesJWTSecret(t *testing.T) {
	setRequired(t)
	t.Setenv("PICOCLAW_SAAS_GATEWAY_SECRET", "explicit-gateway-secret")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.GatewaySharedSecret != "explicit-gateway-secret" {
		t.Errorf("GatewaySharedSecret = %q, want explicit-gateway-secret", cfg.GatewaySharedSecret)
	}
}

func TestLoad_Defaults(t *testing.T) {
	setRequired(t)
	// Ensure overridable defaults are unset
	t.Setenv("LISTEN_ADDR", "")
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("TENANT_NETWORK_EDGE", "")
	t.Setenv("TENANT_NETWORK_LLM", "")
	t.Setenv("TENANT_IMAGE", "")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ListenAddr != ":8080" {
		t.Errorf("ListenAddr default = %q, want :8080", cfg.ListenAddr)
	}
	if cfg.DockerHost != "unix:///var/run/docker.sock" {
		t.Errorf("DockerHost default = %q", cfg.DockerHost)
	}
	if cfg.TenantNetworkEdge != "saas_edge" {
		t.Errorf("TenantNetworkEdge default = %q", cfg.TenantNetworkEdge)
	}
	if cfg.TenantNetworkLLM != "saas_llm" {
		t.Errorf("TenantNetworkLLM default = %q", cfg.TenantNetworkLLM)
	}
	if cfg.TenantImage != "picoclaw-launcher:latest" {
		t.Errorf("TenantImage default = %q", cfg.TenantImage)
	}
}

func TestLoad_OverrideListenAddr(t *testing.T) {
	setRequired(t)
	t.Setenv("LISTEN_ADDR", ":9090")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ListenAddr != ":9090" {
		t.Errorf("ListenAddr = %q, want :9090", cfg.ListenAddr)
	}
}

func TestLoad_CookieSecureDefaultTrue(t *testing.T) {
	setRequired(t)
	t.Setenv("COOKIE_SECURE", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.CookieSecure {
		t.Error("CookieSecure should default to true")
	}
}

func TestLoad_CookieSecureCanBeDisabled(t *testing.T) {
	setRequired(t)
	t.Setenv("COOKIE_SECURE", "false")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CookieSecure {
		t.Error("CookieSecure should be false when COOKIE_SECURE=false")
	}
}
