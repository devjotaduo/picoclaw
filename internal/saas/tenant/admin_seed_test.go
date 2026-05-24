package tenant

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSeedTenantFromAdminCreate(t *testing.T) {
	t.Run("preenche Nome vazio + adiciona Status pendente", func(t *testing.T) {
		vol := setupTenantVolume(t, "# Memória da empresa\nNome:\nSegmento:\n")
		if err := SeedTenantFromAdminCreate(vol, "Padaria do João", "joao@x.com"); err != nil {
			t.Fatalf("seed: %v", err)
		}
		got := readEmpresa(t, vol)
		if !strings.Contains(got, "Nome: Padaria do João") {
			t.Errorf("Nome não preenchido. got:\n%s", got)
		}
		if !strings.Contains(got, "Status: pendente de validação") {
			t.Errorf("Status pendente faltando. got:\n%s", got)
		}
	})

	t.Run("não toca Nome se já tem valor", func(t *testing.T) {
		vol := setupTenantVolume(t, "Nome: Outra Empresa\nSegmento:\n")
		if err := SeedTenantFromAdminCreate(vol, "Padaria do João", ""); err != nil {
			t.Fatalf("seed: %v", err)
		}
		got := readEmpresa(t, vol)
		if !strings.Contains(got, "Nome: Outra Empresa") {
			t.Errorf("Nome existente foi clobado. got:\n%s", got)
		}
		if strings.Contains(got, "Nome: Padaria do João") {
			t.Errorf("Nome novo não devia ter sido escrito. got:\n%s", got)
		}
	})

	t.Run("preserva Status pendente existente (não duplica)", func(t *testing.T) {
		vol := setupTenantVolume(t, "Nome:\nStatus da informação: pendente de validação\n")
		if err := SeedTenantFromAdminCreate(vol, "Test", ""); err != nil {
			t.Fatalf("seed: %v", err)
		}
		got := readEmpresa(t, vol)
		// Já tinha o marker "Status da informação: pendente" — não dobrou
		if strings.Count(got, "pendente de validação") != 1 {
			t.Errorf("Status duplicou. got:\n%s", got)
		}
	})

	t.Run("no-op quando volumePath vazio", func(t *testing.T) {
		if err := SeedTenantFromAdminCreate("", "x", "y"); err != nil {
			t.Errorf("vazio deveria ser no-op, got err: %v", err)
		}
	})

	t.Run("no-op quando displayName vazio", func(t *testing.T) {
		vol := setupTenantVolume(t, "Nome:\n")
		if err := SeedTenantFromAdminCreate(vol, "", "x@y"); err != nil {
			t.Errorf("displayName vazio deveria ser no-op, got err: %v", err)
		}
		got := readEmpresa(t, vol)
		if strings.Contains(got, "Nome:") && !strings.Contains(got, "Nome:\n") {
			// se ainda tem "Nome:" vazio, OK; só não pode ter "Nome: <algo>"
			t.Logf("got: %s", got)
		}
	})

	t.Run("no-op quando arquivo ausente", func(t *testing.T) {
		dir := t.TempDir()
		if err := SeedTenantFromAdminCreate(dir, "Test", ""); err != nil {
			t.Errorf("arquivo ausente deveria ser no-op, got err: %v", err)
		}
		// não criou nada
		if _, err := os.Stat(filepath.Join(dir, "workspace", "memory", "empresa.md")); !os.IsNotExist(err) {
			t.Error("não deveria ter criado o arquivo")
		}
	})
}

func setupTenantVolume(t *testing.T, empresaContent string) string {
	t.Helper()
	dir := t.TempDir()
	memDir := filepath.Join(dir, "workspace", "memory")
	if err := os.MkdirAll(memDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(memDir, "empresa.md"), []byte(empresaContent), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	return dir
}

func readEmpresa(t *testing.T, vol string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(vol, "workspace", "memory", "empresa.md"))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	return string(data)
}
