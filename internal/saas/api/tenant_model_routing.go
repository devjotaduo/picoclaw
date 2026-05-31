package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

type tenantModelRoutingOut struct {
	Mode    string                         `json:"mode"`
	LiteLLM createTenantLiteLLMRoutingReq  `json:"litellm"`
	CLI     createTenantCLIModelRoutingReq `json:"cli"`
}

func tenantModelRoutingStoreRow(tenantID string, cfg *tenant.ModelRoutingConfig) *store.TenantModelRouting {
	if cfg == nil {
		return &store.TenantModelRouting{TenantID: tenantID, Mode: "auto"}
	}
	return &store.TenantModelRouting{
		TenantID:             tenantID,
		Mode:                 normalizeModelRoutingMode(cfg.Mode),
		LiteLLMModelName:     strings.TrimSpace(cfg.LiteLLM.ModelName),
		LiteLLMAPIBase:       strings.TrimSpace(cfg.LiteLLM.APIBase),
		LiteLLMFallbacks:     cleanStringList(cfg.LiteLLM.Fallbacks),
		LiteLLMAllowedModels: cleanStringList(cfg.LiteLLM.AllowedModels),
		CLIOrder:             cleanStringList(cfg.CLI.Order),
		CLIClaudeModelName:   strings.TrimSpace(cfg.CLI.ClaudeModelName),
		CLIClaudeModel:       strings.TrimSpace(cfg.CLI.ClaudeModel),
		CLICodexModelName:    strings.TrimSpace(cfg.CLI.CodexModelName),
		CLICodexModel:        strings.TrimSpace(cfg.CLI.CodexModel),
	}
}

func tenantModelRoutingConfigFromStore(row *store.TenantModelRouting) *tenant.ModelRoutingConfig {
	if row == nil {
		return nil
	}
	return &tenant.ModelRoutingConfig{
		Mode: normalizeModelRoutingMode(row.Mode),
		LiteLLM: tenant.LiteLLMModelRoutingConfig{
			ModelName:     strings.TrimSpace(row.LiteLLMModelName),
			APIBase:       strings.TrimSpace(row.LiteLLMAPIBase),
			Fallbacks:     cleanStringList(row.LiteLLMFallbacks),
			AllowedModels: cleanStringList(row.LiteLLMAllowedModels),
		},
		CLI: tenant.CLIModelRoutingConfig{
			Order:           cleanStringList(row.CLIOrder),
			ClaudeModelName: strings.TrimSpace(row.CLIClaudeModelName),
			ClaudeModel:     strings.TrimSpace(row.CLIClaudeModel),
			CodexModelName:  strings.TrimSpace(row.CLICodexModelName),
			CodexModel:      strings.TrimSpace(row.CLICodexModel),
		},
	}
}

func tenantModelRoutingResponseFromStore(row *store.TenantModelRouting) tenantModelRoutingOut {
	cfg := tenantModelRoutingConfigFromStore(row)
	if cfg == nil {
		cfg = &tenant.ModelRoutingConfig{Mode: "auto"}
	}
	return tenantModelRoutingOut{
		Mode: normalizeModelRoutingMode(cfg.Mode),
		LiteLLM: createTenantLiteLLMRoutingReq{
			ModelName:     cfg.LiteLLM.ModelName,
			APIBase:       cfg.LiteLLM.APIBase,
			Fallbacks:     cfg.LiteLLM.Fallbacks,
			AllowedModels: cfg.LiteLLM.AllowedModels,
		},
		CLI: createTenantCLIModelRoutingReq{
			Order:           cfg.CLI.Order,
			ClaudeModelName: cfg.CLI.ClaudeModelName,
			ClaudeModel:     cfg.CLI.ClaudeModel,
			CodexModelName:  cfg.CLI.CodexModelName,
			CodexModel:      cfg.CLI.CodexModel,
		},
	}
}

func normalizeModelRoutingMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "litellm":
		return "litellm"
	case "cli":
		return "cli"
	default:
		return "auto"
	}
}

func (h *Handler) handleGetTenantModelRouting(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := h.Tenants.Get(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "cliente não encontrado")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	var row *store.TenantModelRouting
	if h.ModelRouting != nil {
		var err error
		row, err = h.ModelRouting.GetOptional(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}
	writeJSON(w, http.StatusOK, tenantModelRoutingResponseFromStore(row))
}

func (h *Handler) handlePutTenantModelRouting(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	var req createTenantModelRoutingReq
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	cfg, err := req.toTenantConfig()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if cfg == nil {
		cfg = &tenant.ModelRoutingConfig{Mode: "auto"}
	}

	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "cliente não encontrado")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if h.Provisioner == nil {
		writeError(w, http.StatusServiceUnavailable, "provisioner not configured")
		return
	}
	if err := h.Provisioner.ApplyModelRouting(r.Context(), t, cfg); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h.ModelRouting != nil {
		if err := h.ModelRouting.Upsert(r.Context(), tenantModelRoutingStoreRow(id, cfg)); err != nil {
			log.Printf("ERROR tenant_model_routing: save tenant=%s: %v", id, err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}
	if err := h.Provisioner.Recreate(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.auditTenantOp(r, id, "tenant.model_routing.update")
	writeJSON(w, http.StatusOK, tenantModelRoutingResponseFromStore(tenantModelRoutingStoreRow(id, cfg)))
}

func (h *Handler) persistTenantModelRouting(
	ctx context.Context,
	tenantID string,
	cfg *tenant.ModelRoutingConfig,
) error {
	if h == nil || h.ModelRouting == nil {
		return nil
	}
	return h.ModelRouting.Upsert(ctx, tenantModelRoutingStoreRow(tenantID, cfg))
}
