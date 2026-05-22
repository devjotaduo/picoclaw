package api

import (
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// handleResendCredentials rotates the tenant owner's Supabase password to
// a fresh random value, generates a one-shot magic link, and emails the
// owner with URL + login + new password + magic link. Used by the admin
// when an operator forgot the password / didn't receive the provisioning
// email / wants to share a fresh access link.
//
// Why rotate instead of resending the original password: the original is
// not stored anywhere after provision (only the bcrypt hash for the
// Supabase user lives in their database, and we never had plaintext to
// begin with after the SendCredentialsEmail goroutine ran). Generating a
// fresh password is the only way to give the operator something usable
// without a full account-recovery dance through Supabase.
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
	if t.SupabaseUserID == nil || *t.SupabaseUserID == "" {
		writeError(
			w,
			http.StatusBadRequest,
			"tenant is not linked to a Supabase user; only supabase-backed tenants support this flow",
		)
		return
	}
	if h.Supabase == nil {
		writeError(w, http.StatusServiceUnavailable, "supabase auth not configured on the controlplane")
		return
	}
	if h.Mailer == nil || !h.Mailer.Enabled() {
		writeError(
			w,
			http.StatusServiceUnavailable,
			"SMTP not configured on the controlplane; configure SMTP_HOST/USER/PASSWORD/ALERT_FROM first",
		)
		return
	}

	// 1. Generate fresh password (16-char base64 url-safe, ~96 bits entropy).
	newPassword, err := auth.GeneratePassword()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "generate password: "+err.Error())
		return
	}

	// 2. Push it to Supabase. If this fails, abort BEFORE emailing — we
	// don't want the operator to receive credentials that don't work.
	if err := h.Supabase.UpdateUserPassword(*t.SupabaseUserID, newPassword); err != nil {
		writeError(w, http.StatusInternalServerError, "rotate password in supabase: "+err.Error())
		return
	}

	// 3. Generate a fresh magic link too (it's bundled in the same email).
	// Failure here is non-fatal: the email still ships with email + password.
	var magicLink string
	if link, mlerr := h.Supabase.GenerateMagicLink(t.OwnerEmail, t.Subdomain); mlerr != nil {
		log.Printf("resend-credentials: magic link generation failed for tenant %s: %v", t.ID, mlerr)
	} else {
		magicLink = link
	}

	// 3b. Wrap the Supabase magic link in a /s/<code> shortlink so the
	// admin has something WhatsApp/SMS-friendly to share. The full
	// Supabase link is 200+ chars with the bearer token baked into the
	// query string — fine for email, terrible for any other channel.
	// Failure is non-fatal: the long URL still works.
	var shortMagicLink string
	if magicLink != "" {
		label := "magic-link tenant=" + t.ID
		if short, sherr := h.CreateShortlinkInternal(r.Context(), magicLink, label, 24*time.Hour); sherr != nil {
			log.Printf("resend-credentials: shortlink wrap failed for tenant %s: %v", t.ID, sherr)
		} else {
			shortMagicLink = short
		}
	}

	// 4. Compose the dashboard URL exactly like the provisioner does, so
	// the email looks identical to the original "welcome" mail.
	dashboardURL := "https://" + t.Subdomain + "." + h.Cfg.TenantBaseDomain + "/"

	// 5. Fire-and-forget the email. We send the SHORT magic link in the
	// email when available — easier for the recipient to click on a
	// mobile mail client + survives line-wrapping mishandling. Falls
	// back to the long URL if shortening failed.
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
		// Return the actual password + magic link too. The admin UI shows
		// these in a dialog with copy buttons so the operator can hand them
		// off directly when email is slow / goes to spam / Brevo is down.
		// Trade-off: the password is plaintext in the response — fine for
		// platform-admin-only access (the endpoint is gated by
		// requirePlatformAdmin and the cookie travels over TLS), and the
		// password was already in transit to the operator via SMTP anyway.
		"initial_password": newPassword,
		"magic_link":       magicLink,
		"short_magic_link": shortMagicLink,
		"info":             "Senha rotacionada. Email enfileirado para " + t.OwnerEmail + " — se demorar, copie a senha/link diretamente abaixo.",
	})
}
