package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	tail := 200
	if v := r.URL.Query().Get("tail"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 1000 {
			tail = n
		}
	}

	tenant, err := h.Tenants.Get(r.Context(), id)
	if err != nil || tenant == nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}
	if tenant.ContainerID == nil || *tenant.ContainerID == "" {
		writeJSON(w, http.StatusOK, map[string]any{"lines": []string{}})
		return
	}

	lines, err := h.Provisioner.Docker.Logs(r.Context(), *tenant.ContainerID, tail)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch logs: "+err.Error())
		return
	}
	if lines == nil {
		lines = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"lines": lines})
}
