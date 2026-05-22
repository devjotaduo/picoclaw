package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/mcp"
	"github.com/sipeed/picoclaw/internal/saas/store"
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

// mcpActivationReq is the JSON body of PUT /workspaces/{id}/mcp/{catalog_id}.
// Credentials is a flat map keyed by CredentialField.Key — the controlplane
// validates required ones server-side before encrypting the whole map.
type mcpActivationReq struct {
	Enabled     bool              `json:"enabled"`
	Credentials map[string]string `json:"credentials"`
}

// mcpActivationOut is the JSON shape returned by the list handler. Raw
// credential values are NEVER serialized — only a credentials_masked
// map[string]bool indicates "this key is present at-rest" without leaking it.
// The admin re-types creds whenever they want to update.
type mcpActivationOut struct {
	CatalogID         string          `json:"catalog_id"`
	Enabled           bool            `json:"enabled"`
	CredentialsMasked map[string]bool `json:"credentials_masked"`
	UpdatedAt         string          `json:"updated_at"`
}

// handleListWorkspaceMCP returns every activated MCP entry for a workspace.
// Credential blob is decrypted only to discover which keys are present; the
// values are dropped and replaced with `true` in credentials_masked so the
// admin UI can render "configured" badges without exposing secrets. When the
// encryption key is unconfigured the decrypt is silently skipped and the
// masked map is empty (the row is still surfaced).
func (h *Handler) handleListWorkspaceMCP(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	rows, err := h.MCP.ListForWorkspace(r.Context(), ws.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}
	out := make([]mcpActivationOut, 0, len(rows))
	for _, row := range rows {
		masked := map[string]bool{}
		if row.CredentialsEncrypted != "" && h.MCPEncKey != nil {
			if creds, derr := mcp.DecryptCredentials(row.CredentialsEncrypted, h.MCPEncKey); derr == nil {
				for k := range creds {
					masked[k] = true
				}
			}
		}
		out = append(out, mcpActivationOut{
			CatalogID:         row.CatalogID,
			Enabled:           row.Enabled,
			CredentialsMasked: masked,
			UpdatedAt:         row.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"servers": out})
}

// handlePutWorkspaceMCP enables or updates one MCP activation for a workspace.
// Validates the catalog id against the in-process mcp.Catalog (400 if unknown),
// requires the encryption key to be configured (503 otherwise), enforces that
// every Required credential field is present and non-empty (400 otherwise),
// then encrypts the whole credentials map and upserts the row.
func (h *Handler) handlePutWorkspaceMCP(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	catalogID := chi.URLParam(r, "catalog_id")
	entry, found := mcp.Lookup(catalogID)
	if !found {
		writeError(w, http.StatusBadRequest, "unknown MCP catalog id: "+catalogID)
		return
	}
	if h.MCPEncKey == nil {
		writeError(w, http.StatusServiceUnavailable, "MCP activation disabled: PICOCLAW_SAAS_MCP_ENCRYPTION_KEY not configured")
		return
	}

	var req mcpActivationReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	// Required-credential validation: every field flagged Required in the
	// catalog must be supplied non-empty. Optional fields may be missing.
	for _, field := range entry.Credentials {
		if !field.Required {
			continue
		}
		v, ok := req.Credentials[field.Key]
		if !ok || v == "" {
			writeError(w, http.StatusBadRequest, "missing required credential: "+field.Key)
			return
		}
	}

	cipher, err := mcp.EncryptCredentials(req.Credentials, h.MCPEncKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "encrypt: "+err.Error())
		return
	}

	row := &store.WorkspaceMCPServer{
		WorkspaceID:          ws.ID,
		CatalogID:            catalogID,
		Enabled:              req.Enabled,
		CredentialsEncrypted: cipher,
	}
	if err := h.MCP.Upsert(r.Context(), row); err != nil {
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleDeleteWorkspaceMCP removes a single activation. The store treats
// non-existent rows as a silent no-op so this endpoint is idempotent — 204
// either way.
func (h *Handler) handleDeleteWorkspaceMCP(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}
	catalogID := chi.URLParam(r, "catalog_id")
	if err := h.MCP.Delete(r.Context(), ws.ID, catalogID); err != nil {
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
