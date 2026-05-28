package api

import (
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/config"
)

// tenantURL is the canonical HTTPS URL for this tenant's dashboard/chat host.
func tenantURL(cfg *config.Config, subdomain string) string {
	base := strings.Trim(cfg.TenantBaseDomain, ".")
	return "https://" + subdomain + "." + base
}

var htmlEscaper = strings.NewReplacer(
	"&", "&amp;",
	"<", "&lt;",
	">", "&gt;",
	"\"", "&quot;",
	"'", "&#39;",
)

func htmlEscape(s string) string { return htmlEscaper.Replace(s) }
