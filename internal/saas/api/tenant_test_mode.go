package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

func (h *Handler) handleFinishTenantTestMode(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		writeError(w, http.StatusBadRequest, "tenant id is required")
		return
	}
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if t.VolumePath == "" {
		writeError(w, http.StatusUnprocessableEntity, "tenant has no volume path")
		return
	}
	actor := "admin"
	if user, ok := userFromContext(r.Context()); ok && strings.TrimSpace(user.Email) != "" {
		actor = user.Email
	}
	status, err := tenant.FinishTestMode(t.VolumePath, tenant.FinishTestModeInput{
		CompletedBy:              actor,
		CompletedSource:          "admin",
		RequireWhatsAppAllowlist: true,
	})
	if err != nil {
		if errors.Is(err, tenant.ErrWhatsAppAllowlistRequired) {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"tenant_id": id,
				"finished":  false,
				"reason":    "whatsapp_allowlist_empty",
				"status":    status,
			})
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.auditTenantOp(r, id, "tenant.test_mode.finish")
	writeJSON(w, http.StatusOK, map[string]any{
		"tenant_id": id,
		"finished":  true,
		"status":    status,
	})
}
