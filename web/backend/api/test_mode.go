package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	saastenant "github.com/sipeed/picoclaw/internal/saas/tenant"
	"github.com/sipeed/picoclaw/pkg/config"
)

func (h *Handler) registerTestModeRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/test-mode", h.handleGetTestMode)
	mux.HandleFunc("POST /api/workspace/test-mode/finish", h.handleFinishTestMode)
}

func (h *Handler) handleGetTestMode(w http.ResponseWriter, _ *http.Request) {
	volumeRoot, err := h.currentTenantVolumeRoot()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	status, err := saastenant.ReadTestModeStatus(volumeRoot)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load test mode: %v", err), http.StatusInternalServerError)
		return
	}
	writeJSON(w, status)
}

func (h *Handler) handleFinishTestMode(w http.ResponseWriter, _ *http.Request) {
	volumeRoot, err := h.currentTenantVolumeRoot()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	status, err := saastenant.FinishTestMode(volumeRoot, saastenant.FinishTestModeInput{
		CompletedBy:              "tenant_owner",
		CompletedSource:          "owner",
		RequireWhatsAppAllowlist: true,
	})
	if err != nil {
		if errors.Is(err, saastenant.ErrWhatsAppAllowlistRequired) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"finished": false,
				"reason":   "whatsapp_allowlist_empty",
				"status":   status,
			})
			return
		}
		http.Error(w, fmt.Sprintf("Failed to finish test mode: %v", err), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{
		"finished": true,
		"status":   status,
	})
}

func (h *Handler) currentTenantVolumeRoot() (string, error) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		return "", fmt.Errorf("Failed to load config: %w", err)
	}
	workspace := strings.TrimSpace(cfg.WorkspacePath())
	if workspace == "" {
		return filepath.Dir(h.configPath), nil
	}
	if filepath.Base(workspace) == "workspace" {
		return filepath.Dir(workspace), nil
	}
	return filepath.Dir(h.configPath), nil
}
