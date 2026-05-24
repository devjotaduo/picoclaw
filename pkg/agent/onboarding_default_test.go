package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCheckOnboardingIncomplete(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    bool
	}{
		{
			name: "template padrão com Status pendente",
			content: `# Memória da empresa
Nome:
Segmento:
Status da informação: pendente de validação`,
			want: true,
		},
		{
			name:    "Nome vazio (uma linha)",
			content: "Nome:\nOutra linha qualquer\n",
			want:    true,
		},
		{
			name:    "Segmento vazio (uma linha)",
			content: "Nome: Padaria do João\nSegmento:\nDescrição: pães\n",
			want:    true,
		},
		{
			name: "preenchido completo + sem marker pendente",
			content: `# Memória da empresa
Nome: Padaria do João
Segmento: alimentacao
Descrição: pães artesanais
Status: validado pelo dono em 2026-01-01`,
			want: false,
		},
		{
			name: "Nome com whitespace só não vale (regex captura)",
			content: `Nome:
Segmento: varejo`,
			want: true,
		},
		{
			name:    "vazio total",
			content: "",
			want:    false, // sem matchear marcadores; defer pra mtime checks
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := checkOnboardingIncomplete(tt.content); got != tt.want {
				t.Errorf("checkOnboardingIncomplete() = %v, want %v\ncontent:\n%s", got, tt.want, tt.content)
			}
		})
	}
}

func TestOnboardingDetector_IsIncomplete(t *testing.T) {
	dir := t.TempDir()
	memDir := filepath.Join(dir, "memory")
	if err := os.MkdirAll(memDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	empresaPath := filepath.Join(memDir, "empresa.md")

	d := newOnboardingDetector(dir)

	// Arquivo ausente → incompleto
	if !d.IsIncomplete() {
		t.Error("sem empresa.md deveria ser incompleto")
	}

	// Arquivo com template padrão → incompleto
	if err := os.WriteFile(empresaPath, []byte("Nome:\nSegmento:\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	// Invalida cache (mtime acabou de mudar — boa)
	d.lastCheck = d.lastCheck.Add(-onboardingCacheTTL * 2)
	if !d.IsIncomplete() {
		t.Error("template vazio deveria ser incompleto")
	}

	// Preenchido → completo
	if err := os.WriteFile(empresaPath, []byte("Nome: Padaria do João\nSegmento: alimentacao\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	d.lastCheck = d.lastCheck.Add(-onboardingCacheTTL * 2)
	if d.IsIncomplete() {
		t.Error("preenchido não deveria ser incompleto")
	}
}

func TestOnboardingDetector_NilSafe(t *testing.T) {
	var d *onboardingDetector
	if d.IsIncomplete() {
		t.Error("nil detector deveria retornar false sem panic")
	}
}
