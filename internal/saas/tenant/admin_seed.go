package tenant

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var reEmpresaEmptyNome = regexp.MustCompile(`(?m)^Nome:\s*$`)

// SeedTenantFromAdminCreate patches the baseline company memory for tenants
// created through the admin UI. The admin only provides DisplayName and
// OwnerEmail; Sofia fills the business details during the public-tenant chat.
func SeedTenantFromAdminCreate(volumePath, displayName, ownerEmail string) error {
	if volumePath == "" {
		return nil
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return nil
	}
	_ = ownerEmail // reserved for future use; do not write PII into memory.

	path := filepath.Join(volumePath, "workspace", "memory", "empresa.md")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read empresa.md: %w", err)
	}

	content := string(data)
	original := content

	if reEmpresaEmptyNome.MatchString(content) {
		content = reEmpresaEmptyNome.ReplaceAllString(content, "Nome: "+displayName)
	}
	if !strings.Contains(content, "Status: pendente de validação") &&
		!strings.Contains(content, "Status da informação: pendente de validação") {
		if !strings.HasSuffix(content, "\n") {
			content += "\n"
		}
		content += "Status: pendente de validação\n"
	}

	if content == original {
		return nil
	}
	return os.WriteFile(path, []byte(content), 0o644)
}
