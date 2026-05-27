package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBuildCompanyProfileResponseSanitizesWorkspaceAndStatuses(t *testing.T) {
	workspace := t.TempDir()
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("memory", "empresa.md"), `Nome: Empresa PME Brasil [ATUALIZAR]
Segmento: varejo
Horário:
- Segunda a sexta: 08h às 18h
Status da informação: pendente de validação
`)
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("config", "authorized-channels.md"), `# Canais autorizados

Canais autorizados:
- WhatsApp principal
`)

	got, err := buildCompanyProfileResponse(
		workspace,
		time.Date(2026, 5, 21, 10, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("buildCompanyProfileResponse() error = %v", err)
	}
	if got.Workspace != "workspace" {
		t.Fatalf("workspace = %q, want sanitized workspace label", got.Workspace)
	}
	if got.Total == 0 || len(got.Groups) == 0 {
		t.Fatal("expected profile groups and fields")
	}
	fields := companyProfileFieldsByID(got)
	if fields["company_name"].Status != companyProfileFieldMissing {
		t.Fatalf("company_name status = %q, want missing", fields["company_name"].Status)
	}
	if fields["business_hours"].Status != companyProfileFieldFilled {
		t.Fatalf("business_hours status = %q, want filled", fields["business_hours"].Status)
	}
	if fields["information_status"].Status != companyProfileFieldPending {
		t.Fatalf("information_status status = %q, want pending", fields["information_status"].Status)
	}
	rawResponse, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("Marshal response error = %v", err)
	}
	if strings.Contains(string(rawResponse), workspace) {
		t.Fatal("response should not expose absolute workspace path")
	}
}

func TestSaveCompanyProfileFieldsUpdatesMarkdownAndCreatesBackup(t *testing.T) {
	workspace := t.TempDir()
	mustWriteCompanyOnboardingFile(t, workspace, filepath.Join("memory", "empresa.md"), `# Memória da empresa

Nome: Loja antiga
Notas internas: manter
`)

	first, err := saveCompanyProfileFields(
		workspace,
		map[string]string{
			"company_name":      "Loja Sol",
			"products_services": "Roupas\nAcessórios",
		},
		time.Date(2026, 5, 21, 10, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("saveCompanyProfileFields() error = %v", err)
	}
	if first.Updated != 2 {
		t.Fatalf("Updated = %d, want 2", first.Updated)
	}
	content := readTestFile(t, filepath.Join(workspace, "memory", "empresa.md"))
	for _, want := range []string{"Nome: Loja Sol", "Notas internas: manter", "Produtos ou serviços:", "- Roupas", "- Acessórios"} {
		if !strings.Contains(content, want) {
			t.Fatalf("updated memory file missing %q:\n%s", want, content)
		}
	}
	if len(first.BackupPaths) == 0 {
		t.Fatal("expected backup for existing memory file")
	}

	second, err := saveCompanyProfileFields(
		workspace,
		map[string]string{"company_name": "Loja Sol Centro"},
		time.Date(2026, 5, 21, 10, 1, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("second saveCompanyProfileFields() error = %v", err)
	}
	if second.BackupPaths["memory/empresa.md"] == "" {
		t.Fatal("expected backup path for second save")
	}
	content = readTestFile(t, filepath.Join(workspace, "memory", "empresa.md"))
	if !strings.Contains(content, "Nome: Loja Sol Centro") {
		t.Fatalf("expected updated company name:\n%s", content)
	}
}

func TestHandlePutCompanyProfileReturnsOK(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	body := bytes.NewBufferString(`{"fields":{"company_name":"Clínica Sol","segment":"saúde"}}`)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/workspace/company-profile", body)

	h.handlePutCompanyProfile(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("PUT company profile = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	content := readTestFile(t, filepath.Join(workspace, "memory", "empresa.md"))
	if !strings.Contains(content, "Nome: Clínica Sol") || !strings.Contains(content, "Segmento: saúde") {
		t.Fatalf("expected saved profile content:\n%s", content)
	}
}

func companyProfileFieldsByID(response companyProfileResponse) map[string]companyProfileField {
	fields := make(map[string]companyProfileField)
	for _, group := range response.Groups {
		for _, field := range group.Fields {
			fields[field.ID] = field
		}
	}
	return fields
}

func readTestFile(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", path, err)
	}
	return string(content)
}
