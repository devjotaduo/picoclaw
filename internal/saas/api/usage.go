package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

// handleGetUsage returns aggregated + recent usage for a tenant.
// Query params:
//
//	from=YYYY-MM-DD (default: first of current month UTC)
//	to=YYYY-MM-DD   (default: now UTC)
//	limit=N         (default: 50, max: 500) — number of recent records to include
func (h *Handler) handleGetUsage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, err := h.Tenants.Get(r.Context(), id); err != nil {
		writeError(w, http.StatusNotFound, "tenant not found")
		return
	}

	now := time.Now().UTC()
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	to := now

	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			from = t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			to = t.Add(24 * time.Hour)
		}
	}
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}

	sum, err := h.Usage.Summarize(r.Context(), id, from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "summarize: "+err.Error())
		return
	}
	recent, err := h.Usage.Recent(r.Context(), id, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "recent: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"from":    from,
		"to":      to,
		"summary": sum,
		"recent":  recent,
	})
}
