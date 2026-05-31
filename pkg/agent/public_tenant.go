package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
)

const (
	envPublicTenant                  = "PICOCLAW_PUBLIC_TENANT"
	publicTenantTechnicalErrorNotice = "Tive uma instabilidade técnica agora. Me chama de novo em alguns instantes que eu retomo daqui."
)

var publicTenantInternalMarkers = []string{
	"`rg`",
	" rg ",
	"exec(",
	"delegate(",
	"workspace/",
	"workspace\\",
	"memory/",
	"memory\\",
	"state.py",
	"ui-visibility",
	"onboarding-state",
	"agent.md",
	"skill.md",
	"picoclaw_",
	"jotaduo_wa_",
	"codex cli",
	"llm call failed",
	"exit status",
	"tool call",
	"tool_calls",
	"sandbox",
	"referência de segmento",
	"referencia de segmento",
	"arquivo de segmento",
	"pasta de segmento",
	"pasta de segmentos",
	"validação técnica",
	"validacao tecnica",
	"vou puxar",
	"vou sinalizar internamente",
	"vou gravar",
	"marcar o discovery",
	"bloqueio antigo",
	"estado ficou",
	"sincronizar isso",
}

func isPublicPicoTenantRuntime(channel string) bool {
	return strings.EqualFold(strings.TrimSpace(channel), "pico") && isPublicTenantRuntime()
}

func isPublicTenantRuntime() bool {
	if parsePublicTenantBool(os.Getenv(envPublicTenant)) {
		return true
	}
	profile, ok := activeUIVisibilityProfile(config.GetHome())
	return ok && strings.EqualFold(profile, "public")
}

func parsePublicTenantBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func activeUIVisibilityProfile(home string) (string, bool) {
	home = strings.TrimSpace(home)
	if home == "" {
		return "", false
	}
	data, err := os.ReadFile(filepath.Join(home, "ui-visibility.json"))
	if err != nil {
		return "", false
	}
	var raw struct {
		ActiveProfile string `json:"active_profile"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return "", false
	}
	profile := strings.TrimSpace(raw.ActiveProfile)
	return profile, profile != ""
}

func sanitizePublicPicoContent(channel, content string) string {
	if !isPublicPicoTenantRuntime(channel) {
		return content
	}
	return sanitizePublicTenantContent(content)
}

func publicTenantTechnicalErrorResponse(channel string) (string, bool) {
	if !isPublicPicoTenantRuntime(channel) {
		return "", false
	}
	return publicTenantTechnicalErrorNotice, true
}

func sanitizePublicTenantContent(content string) string {
	if !publicTenantTextContainsInternalMarker(content) {
		return content
	}

	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if publicTenantTextContainsInternalMarker(line) {
			continue
		}
		kept = append(kept, line)
	}

	cleaned := strings.TrimSpace(strings.Join(kept, "\n"))
	if cleaned == "" {
		return "Anotei. Vou seguir com o cadastro por aqui. Me confirma o próximo dado da operação?"
	}
	return cleaned
}

func publicTenantTextContainsInternalMarker(content string) bool {
	lower := strings.ToLower(content)
	padded := " " + lower + " "
	for _, marker := range publicTenantInternalMarkers {
		if strings.Contains(padded, marker) {
			return true
		}
	}
	return false
}
