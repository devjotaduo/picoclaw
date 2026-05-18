package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// handleTenantSanity exposes the post-clone sanity report on demand. Useful
// when the operator wants to re-verify a tenant after manual changes or after
// a container restart. Restricted to platform_admin (mounted in router.go).
func (h *Handler) handleTenantSanity(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id is required")
		return
	}
	checks := h.Provisioner.RunPostCloneChecks(r.Context(), id)
	writeJSON(w, http.StatusOK, map[string]any{
		"tenant_id":     id,
		"sanity_checks": checks,
	})
}
