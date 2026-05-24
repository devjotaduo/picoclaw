package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type tenantLauncherForgotPasswordReq struct {
	Email string `json:"email"`
}

// handleResendCredentials rotates the tenant owner's password and emails the
// owner with URL + login + new password. Supports two backends:
//
//   - "launcher" (new default): reseeds the launcher's dashboardauth.db SQLite
//     with a fresh bcrypt hash and restarts the container so the new hash is
//     loaded. No magic link — the owner logs in via /launcher-login.
//
//   - "supabase" (legacy): rotates the Supabase password + generates a one-shot
//     magic link, same as before.
//
// Route: POST /api/v1/tenants/{id}/resend-credentials (requirePlatformAdmin)
func (h *Handler) handleResendCredentials(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id required")
		return
	}

	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return
	}

	if t.OwnerEmail == "" {
		writeError(w, http.StatusBadRequest, "tenant has no owner_email on record; cannot resend credentials")
		return
	}

	// ── Launcher-native path (default for new tenants) ────────────────────
	if t.AuthBackend != "supabase" {
		if h.Mailer == nil || !h.Mailer.Enabled() {
			writeError(w, http.StatusServiceUnavailable,
				"SMTP não configurado — configure SMTP_HOST/USER/PASSWORD/ALERT_FROM primeiro")
			return
		}

		// RotatePassword generates a fresh password, writes the bcrypt hash into
		// dashboardauth.db, then restarts the container so the new hash is loaded.
		newPassword, err := h.Provisioner.RotatePassword(r.Context(), t.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "rotate launcher password: "+err.Error())
			return
		}

		dashboardURL := "https://" + t.Subdomain + "." + h.Cfg.TenantBaseDomain + "/"
		go h.Mailer.SendCredentialsEmail(
			t.OwnerEmail,
			t.DisplayName,
			dashboardURL,
			t.OwnerEmail,
			newPassword,
			"",
		)

		writeJSON(w, http.StatusOK, map[string]any{
			"sent_to":             t.OwnerEmail,
			"password_rotated":    true,
			"magic_link_in_email": false,
			"dashboard_url":       dashboardURL,
			"initial_password":    newPassword,
			"magic_link":          "",
			"short_magic_link":    "",
			"info":                "Senha rotacionada. Email enviado para " + t.OwnerEmail + ".",
		})
		return
	}

	// ── Legacy Supabase path ───────────────────────────────────────────────
	if t.SupabaseUserID == nil || *t.SupabaseUserID == "" {
		writeError(w, http.StatusBadRequest,
			"tenant is not linked to a Supabase user; only supabase-backed tenants support this flow")
		return
	}
	if h.Supabase == nil {
		writeError(w, http.StatusServiceUnavailable, "supabase auth not configured on the controlplane")
		return
	}
	if h.Mailer == nil || !h.Mailer.Enabled() {
		writeError(w, http.StatusServiceUnavailable,
			"SMTP not configured on the controlplane; configure SMTP_HOST/USER/PASSWORD/ALERT_FROM first")
		return
	}

	newPassword, err := auth.GeneratePassword()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "generate password: "+err.Error())
		return
	}

	if err := h.Supabase.UpdateUserPassword(*t.SupabaseUserID, newPassword); err != nil {
		writeError(w, http.StatusInternalServerError, "rotate password in supabase: "+err.Error())
		return
	}

	var magicLink string
	if link, mlerr := h.Supabase.GenerateMagicLink(t.OwnerEmail, t.Subdomain); mlerr != nil {
		log.Printf("resend-credentials: magic link generation failed for tenant %s: %v", t.ID, mlerr)
	} else {
		magicLink = link
	}

	var shortMagicLink string
	if magicLink != "" {
		label := "magic-link tenant=" + t.ID
		if short, sherr := h.CreateShortlinkInternal(r.Context(), magicLink, label, 24*time.Hour); sherr != nil {
			log.Printf("resend-credentials: shortlink wrap failed for tenant %s: %v", t.ID, sherr)
		} else {
			shortMagicLink = short
		}
	}

	dashboardURL := "https://" + t.Subdomain + "." + h.Cfg.TenantBaseDomain + "/"
	mailMagicLink := magicLink
	if shortMagicLink != "" {
		mailMagicLink = shortMagicLink
	}
	go h.Mailer.SendCredentialsEmail(
		t.OwnerEmail,
		t.DisplayName,
		dashboardURL,
		t.OwnerEmail,
		newPassword,
		mailMagicLink,
	)

	writeJSON(w, http.StatusOK, map[string]any{
		"sent_to":             t.OwnerEmail,
		"password_rotated":    true,
		"magic_link_in_email": magicLink != "",
		"dashboard_url":       dashboardURL,
		"initial_password":    newPassword,
		"magic_link":          magicLink,
		"short_magic_link":    shortMagicLink,
		"info":                "Senha rotacionada. Email enfileirado para " + t.OwnerEmail + " — se demorar, copie a senha/link diretamente abaixo.",
	})
}

// handleTenantLauncherForgotPassword is the self-service recovery flow used by
// the tenant-owned /launcher-login page. It intentionally returns 204 for
// malformed, unknown, or non-owner emails so the endpoint cannot enumerate
// tenants or owners. A matching launcher-native tenant rotates the dashboard
// password and emails the owner with the new credentials.
func (h *Handler) handleTenantLauncherForgotPassword(w http.ResponseWriter, r *http.Request, t *store.Tenant) {
	if h.LoginAttempts != nil && !h.LoginAttempts.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "too many attempts; try again later")
		return
	}

	var req tenantLauncherForgotPasswordReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil && err != io.EOF {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	ownerEmail := strings.TrimSpace(strings.ToLower(t.OwnerEmail))
	if email == "" || ownerEmail == "" || email != ownerEmail {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if t.AuthBackend == "supabase" || t.IsPublic {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if h.Mailer == nil || !h.Mailer.Enabled() {
		log.Printf("tenant forgot-password: SMTP disabled for tenant %s; not rotating password", t.ID)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if h.Provisioner == nil {
		log.Printf("tenant forgot-password: provisioner unavailable for tenant %s", t.ID)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	newPassword, err := h.Provisioner.RotatePassword(r.Context(), t.ID)
	if err != nil {
		log.Printf("tenant forgot-password: rotate launcher password for tenant %s failed: %v", t.ID, err)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	dashboardURL := "https://" + t.Subdomain + "." + h.Cfg.TenantBaseDomain + "/"
	go h.Mailer.SendCredentialsEmail(
		t.OwnerEmail,
		t.DisplayName,
		dashboardURL,
		t.OwnerEmail,
		newPassword,
		"",
	)
	if h.Audit != nil {
		_ = h.Audit.Insert(r.Context(), nil, &t.ID, "tenant.password.recovery.request", "tenant", t.Subdomain)
	}
	w.WriteHeader(http.StatusNoContent)
}
