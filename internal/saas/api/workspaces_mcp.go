package api

import (
	"net/http"

	"github.com/sipeed/picoclaw/internal/saas/mcp"
)

// handleGetMCPCatalog returns the curated list of MCP servers admins can
// activate per workspace. Hardcoded in internal/saas/mcp — adding an MCP is
// a code change, not a runtime action.
func (h *Handler) handleGetMCPCatalog(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]any, 0, len(mcp.Catalog))
	for _, e := range mcp.Catalog {
		creds := make([]map[string]any, 0, len(e.Credentials))
		for _, c := range e.Credentials {
			creds = append(creds, map[string]any{
				"key":         c.Key,
				"label":       c.Label,
				"placeholder": c.Placeholder,
				"help":        c.Help,
				"required":    c.Required,
				"secret":      c.Secret,
			})
		}
		out = append(out, map[string]any{
			"id":           e.ID,
			"name":         e.DisplayName,
			"vendor":       e.Vendor,
			"category":     e.Category,
			"description":  e.Description,
			"integrations": e.Integrations,
			"verticals":    e.Verticals,
			"credentials":  creds,
			"official":     e.Official,
			"docs_url":     e.DocsURL,
			"cost_tier":    e.CostTier,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": out})
}
