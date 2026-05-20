package tenant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

func TestSeedTenantFromIntakeWritesAllFiles(t *testing.T) {
	vol := t.TempDir()
	mustWriteFile(t, filepath.Join(vol, "workspace", "AGENT.md"), "team", 0o644)

	answers := map[string]any{
		"offer":           "Móveis sob medida",
		"segments":        []string{"móveis", "sob medida"},
		"channels":        []string{"instagram", "whatsapp"},
		"pains":           []string{"orçamento demora horas", "esqueço de cobrar"},
		"systems":         []string{"planilha"},
		"website":         "https://acme.com",
		"instagram":       "@acme",
		"crm_name":        "planilha do Google",
		"problem_area":    "vendas",
		"product_type":    "móveis planejados",
		"priority_agent":  "marcos",
		"priority_reason": "vende sob medida, orçamento demora",
	}
	raw, _ := json.Marshal(answers)
	intake := &store.CompanyIntake{
		ID:              "ci_test",
		Status:          store.CompanyIntakeDraft,
		CompanyName:     "Acme Móveis",
		ContactName:     "Maria",
		ContactEmail:    "maria@acme.com",
		ContactWhatsApp: "+5511999998888",
		AnswersJSON:     json.RawMessage(raw),
	}

	if err := SeedTenantFromIntake(vol, intake); err != nil {
		t.Fatalf("SeedTenantFromIntake: %v", err)
	}

	checks := []struct {
		path string
		must []string
	}{
		{
			filepath.Join(vol, "workspace", "memory", "empresa.md"),
			[]string{
				"Nome: Acme Móveis",
				"WhatsApp: +5511999998888",
				"Instagram: @acme",
				"Site: https://acme.com",
				"Status da informação: pendente de validação",
				"Agente prioritário: marcos",
				"Área: vendas",
			},
		},
		{
			filepath.Join(vol, "workspace", "memory", "leads.md"),
			[]string{
				"Lead 1 — dono do tenant",
				"Nome: Maria",
				"Empresa: Acme Móveis",
				"Contato: maria@acme.com — +5511999998888",
				"Origem: pré-cadastro Clara",
				"Agente responsável: Sofia",
				"Sofia receber o dono no painel",
				"Status: pendente de validação",
			},
		},
		{
			filepath.Join(vol, "workspace", "memory", "canais-autorizados.md"),
			[]string{
				"## Rafael",
				"Número do dono: +5511999998888",
				"Sofia faz o onboarding no painel",
			},
		},
		{
			filepath.Join(vol, "workspace", "memory", "atendimentos.md"),
			[]string{
				"Atendimento 1 — pré-cadastro Clara",
				"Cliente: Maria (Acme Móveis)",
				"Foco prioritário: marcos",
				"Área de dor: vendas",
				"Resultado: qualificado, tenant provisionado.",
			},
		},
		{
			filepath.Join(vol, "workspace", "config", "company-profile.md"),
			[]string{
				"Nome da empresa: Acme Móveis",
				"WhatsApp: +5511999998888",
				"Instagram: @acme",
				"Responsável humano: Maria (maria@acme.com)",
				"Sofia faz o onboarding no painel",
			},
		},
	}

	for _, c := range checks {
		raw, err := os.ReadFile(c.path)
		if err != nil {
			t.Errorf("%s missing: %v", c.path, err)
			continue
		}
		content := string(raw)
		for _, snippet := range c.must {
			if !strings.Contains(content, snippet) {
				t.Errorf("%s missing snippet %q\n--- content ---\n%s", filepath.Base(c.path), snippet, content)
			}
		}
	}
}

func TestSeedTenantFromIntakeIsIdempotent(t *testing.T) {
	vol := t.TempDir()
	mustWriteFile(t, filepath.Join(vol, "workspace", "AGENT.md"), "team", 0o644)
	// Tenant already has a customised empresa.md (e.g. from a re-provision
	// or operator edit). Seeding must not clobber it.
	mustWriteFile(t,
		filepath.Join(vol, "workspace", "memory", "empresa.md"),
		"# Customisado pelo dono — não tocar",
		0o644,
	)

	intake := &store.CompanyIntake{
		ID:           "ci_test2",
		CompanyName:  "Acme",
		ContactEmail: "x@x.com",
		AnswersJSON:  json.RawMessage(`{}`),
	}

	if err := SeedTenantFromIntake(vol, intake); err != nil {
		t.Fatalf("SeedTenantFromIntake: %v", err)
	}
	assertFileContent(t,
		filepath.Join(vol, "workspace", "memory", "empresa.md"),
		"# Customisado pelo dono — não tocar",
	)
	// Other files still get created.
	if _, err := os.Stat(filepath.Join(vol, "workspace", "memory", "leads.md")); err != nil {
		t.Errorf("leads.md should have been created: %v", err)
	}
}

func TestSeedTenantFromIntakeNoopWithoutWorkspace(t *testing.T) {
	// Empty volume — no workspace/ dir means we don't try to write into a
	// half-provisioned tenant.
	vol := t.TempDir()
	intake := &store.CompanyIntake{
		ID:           "ci_test3",
		CompanyName:  "Acme",
		ContactEmail: "x@x.com",
		AnswersJSON:  json.RawMessage(`{}`),
	}
	if err := SeedTenantFromIntake(vol, intake); err != nil {
		t.Fatalf("SeedTenantFromIntake: %v", err)
	}
	if _, err := os.Stat(filepath.Join(vol, "workspace")); err == nil {
		t.Error("should not have created workspace/")
	}
}

func TestSeedTenantFromIntakeNoopWithNilIntake(t *testing.T) {
	vol := t.TempDir()
	mustWriteFile(t, filepath.Join(vol, "workspace", "AGENT.md"), "team", 0o644)
	if err := SeedTenantFromIntake(vol, nil); err != nil {
		t.Fatalf("nil intake should be no-op, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(vol, "workspace", "memory", "empresa.md")); err == nil {
		t.Error("should not have created memory files for nil intake")
	}
}
