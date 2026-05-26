package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
)

// uiVisibilityFilename is the on-disk name (at $PICOCLAW_HOME root) the
// SaaS provisioner writes via tenant.SetUIVisibilityActiveProfile and the
// LLM tool pkg/tools/set_ui_profile updates at runtime. The frontend's
// useUIVisibility hook fetches this through the endpoint below to render
// the right sidebar/header/chat surface per tenant_type.
const uiVisibilityFilename = "ui-visibility.json"

func (h *Handler) registerLauncherUIVisibilityRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/launcher/ui-visibility", h.handleGetLauncherUIVisibility)
}

// handleGetLauncherUIVisibility serves the per-tenant ui-visibility.json
// from $PICOCLAW_HOME so the embedded SPA renders the active_profile
// the SaaS provisioner wrote at create time. Returns 404 when the file
// is missing — the frontend then falls back to its bundled default policy.
func (h *Handler) handleGetLauncherUIVisibility(w http.ResponseWriter, r *http.Request) {
	path := filepath.Join(h.homeDir(), uiVisibilityFilename)
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "read ui-visibility: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Validate JSON parses so we never serve garbage to the frontend; a
	// corrupt file should fail loudly here rather than break the SPA boot.
	var doc any
	if err := json.Unmarshal(b, &doc); err != nil {
		http.Error(w, "invalid ui-visibility json: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(b)
}
