package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBuildCompanyOnboardingResponseDetectsMissingSetupValues(t *testing.T) {
	workspace := t.TempDir()
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("memory", "empresa.md"), `Nome:
Segmento:
Status da informação: pendente de validação
`)
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("config", "company-profile.md"), `# Perfil da empresa

Nome da empresa: Empresa PME Brasil [ATUALIZAR]
Segmento: Comércio [ATUALIZAR]

Horário de funcionamento:
- Segunda a sexta: 08h às 18h
`)
	mustWriteCompanyOnboardingFile(
		t,
		workspace,
		filepath.Join("config", "authorized-channels.md"),
		`# Canais autorizados
- "Grupo de atendimento" [ATUALIZAR — nome exato do grupo]
`,
	)

	got, err := buildCompanyOnboardingResponse(workspace, time.Date(2026, 5, 21, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("buildCompanyOnboardingResponse() error = %v", err)
	}
	if got.Total == 0 {
		t.Fatal("expected onboarding items")
	}
	if got.Workspace != "workspace" {
		t.Fatalf("workspace = %q, want sanitized workspace label", got.Workspace)
	}
	if got.Missing == 0 {
		t.Fatal("expected missing setup values")
	}
	if !companyOnboardingItemByID(got.Items, "hours").Completed {
		t.Fatal("expected hours to be completed")
	}
	if companyOnboardingItemByID(got.Items, "name").Completed {
		t.Fatal("expected placeholder company name to be missing")
	}
	rawResponse, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("Marshal response error = %v", err)
	}
	if strings.Contains(string(rawResponse), workspace) {
		t.Fatal("response should not expose absolute workspace path")
	}
}

func TestHandleGetCompanyOnboardingReturnsOK(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("memory", "empresa.md"), `Nome: Loja Sol
Segmento: varejo
Descrição: Loja de bairro
Produtos ou serviços: roupas
Horário: 08h às 18h
Endereço: Rua Um
Regiões atendidas: Centro
WhatsApp: +55 11 99999-9999
Formas de pagamento: Pix
Pode falar preço: sim
Faixa de preço: R$ 10 a R$ 200
Quando chamar humano: reclamação
Informações que nunca podem ser inventadas: preço
Informações proibidas de falar: dados internos
Segmento detectado: varejo
Status da informação: validado
`)
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("config", "company-profile.md"), "")
	mustWriteCompanyOnboardingFile(
		t,
		workspace,
		filepath.Join("config", "authorized-channels.md"),
		`# Canais autorizados
- WhatsApp principal: +55 11 99999-9999
`,
	)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/workspace/company-onboarding", nil)
	h.handleGetCompanyOnboarding(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET onboarding = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var got companyOnboardingResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("Decode response error = %v", err)
	}
	if got.Completed == 0 {
		t.Fatal("expected completed onboarding items")
	}
}

func companyOnboardingItemByID(items []companyOnboardingItem, id string) companyOnboardingItem {
	for _, item := range items {
		if item.ID == id {
			return item
		}
	}
	return companyOnboardingItem{}
}

func mustWriteCompanyOnboardingFile(t *testing.T, workspace, rel, content string) {
	t.Helper()
	path := filepath.Join(workspace, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}
