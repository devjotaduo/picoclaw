package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/pkg/config"
)

func TestSanitizePublicTenantContentDropsInternalLines(t *testing.T) {
	input := strings.Join([]string{
		"Tenho o essencial do fluxo.",
		"Vou rodar `rg` em workspace/skills pra localizar o segmento.",
		"Agora me confirma o canal principal de atendimento?",
	}, "\n")

	got := sanitizePublicTenantContent(input)

	if strings.Contains(got, "`rg`") || strings.Contains(got, "workspace/") {
		t.Fatalf("expected internal markers to be removed, got %q", got)
	}
	if !strings.Contains(got, "Tenho o essencial") || !strings.Contains(got, "canal principal") {
		t.Fatalf("expected public-facing lines to remain, got %q", got)
	}
}

func TestSanitizePublicTenantContentFallback(t *testing.T) {
	got := sanitizePublicTenantContent("Vou sinalizar internamente e sincronizar isso agora.")

	if got == "" {
		t.Fatal("expected fallback message")
	}
	if publicTenantTextContainsInternalMarker(got) {
		t.Fatalf("fallback should not contain internal markers, got %q", got)
	}
}

func TestIsPublicTenantRuntimeFromEnv(t *testing.T) {
	t.Setenv(envPublicTenant, "true")
	t.Setenv(config.EnvHome, t.TempDir())

	if !isPublicPicoTenantRuntime("pico") {
		t.Fatal("expected public Pico runtime when env is true")
	}
	if isPublicPicoTenantRuntime("telegram") {
		t.Fatal("expected public tenant guard to apply only to Pico channel")
	}
}

func TestIsPublicTenantRuntimeFromUIVisibility(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv(envPublicTenant, "")
	t.Setenv(config.EnvHome, tmp)

	if err := os.WriteFile(filepath.Join(tmp, "ui-visibility.json"), []byte(`{"active_profile":"public"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if !isPublicPicoTenantRuntime("pico") {
		t.Fatal("expected public Pico runtime from ui-visibility public profile")
	}

	if err := os.WriteFile(filepath.Join(tmp, "ui-visibility.json"), []byte(`{"active_profile":"tenant"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if isPublicPicoTenantRuntime("pico") {
		t.Fatal("expected non-public runtime when ui-visibility profile is tenant")
	}
}

func TestSanitizePublicPicoContentOnlyPublicPico(t *testing.T) {
	t.Setenv(envPublicTenant, "true")
	t.Setenv(config.EnvHome, t.TempDir())

	input := "Vou chamar exec(action=\"run\") para validar."
	if got := sanitizePublicPicoContent("telegram", input); got != input {
		t.Fatalf("expected non-Pico channels to be unchanged, got %q", got)
	}
	if got := sanitizePublicPicoContent("pico", input); got == input || strings.Contains(got, "exec(") {
		t.Fatalf("expected public Pico content to be sanitized, got %q", got)
	}
}
