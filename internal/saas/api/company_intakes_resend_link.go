package api

// Resend-link endpoint: after auto-provision completes with login_mode=magic_link
// the visitor's browser shows "check your email". If the link expires or the
// email lands in spam, the visitor can hit Resend (uses the same resume_token
// they already have so we don't expose a fresh attack surface).

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type resendLinkRequest struct {
	ResumeToken string `json:"resume_token"`
}

func (h *Handler) handleResendMagicLink(w http.ResponseWriter, r *http.Request) {
	if h.AutoProvision == nil || h.Supabase == nil {
		writeError(w, http.StatusServiceUnavailable, "magic link not enabled")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing intake id")
		return
	}

	var req resendLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.ResumeToken == "" {
		writeError(w, http.StatusUnauthorized, "missing resume_token")
		return
	}

	// Reuse Clara's per-IP rate-limit so we don't open a separate abuse vector.
	if !h.ClaraRateLimit.Allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "muitas requisições, tenta em alguns minutos")
		return
	}

	intake, err := h.CompanyIntakes.GetByToken(r.Context(), id, store.CompanyIntakeTokenHash(req.ResumeToken))
	if errors.Is(err, store.ErrCompanyIntakeNotFound) {
		writeError(w, http.StatusUnauthorized, "intake not found or token invalid")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if _, lerr := h.AutoProvision.ResendMagicLink(r.Context(), intake); lerr != nil {
		// Don't leak whether the tenant exists or the supabase user is set:
		// every error path returns the same generic "check email" hint.
		writeJSON(w, http.StatusAccepted, map[string]any{
			"sent": false,
		})
		return
	}
	// We don't return the link itself — Supabase already emailed it. Browser
	// only needs to know the resend was accepted.
	writeJSON(w, http.StatusAccepted, map[string]any{
		"sent":  true,
		"email": intake.ContactEmail,
	})
}
