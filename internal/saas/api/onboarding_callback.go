package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

const (
	onboardingCallbackSigHeader = "X-Onboarding-Signature"
	onboardingCallbackMaxBody   = 1 << 20 // 1 MiB
	onboardingCallbackMaxSkew   = 5 * time.Minute
)

type onboardingCallbackBody struct {
	IntakeID        string `json:"intake_id"`
	Action          string `json:"action"`
	Timestamp       int64  `json:"ts"`
	ContactEmail    string `json:"contact_email,omitempty"`
	ContactWhatsApp string `json:"contact_whatsapp,omitempty"`
	// VisitorIP carries the visitor's real IP (the one the public-web
	// channel hashed into CanonicalSenderID). The skill picks it up from
	// $PICOCLAW_VISITOR_IP set by the channel at message dispatch time.
	// Used to key AutoProvisioner.Run's per-IP rate limiter — without it
	// the limiter would see only the controlplane's loopback RemoteAddr
	// for every callback and become useless. Optional: when empty the
	// controlplane falls back to clientIP(r) (= request RemoteAddr).
	VisitorIP string `json:"visitor_ip,omitempty"`
}

// handleOnboardingCallback receives HMAC-authenticated requests from the
// onboarding tenant's skills (mark-qualified, submit-intake). Verified with
// PICOCLAW_ONBOARDING_CALLBACK_SECRET; rejects stale timestamps (±5 min) to
// prevent replay.
func (h *Handler) handleOnboardingCallback(w http.ResponseWriter, r *http.Request) {
	secret := strings.TrimSpace(h.Cfg.OnboardingCallbackSecret)
	if secret == "" {
		writeError(w, http.StatusServiceUnavailable, "onboarding callback not configured")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, onboardingCallbackMaxBody))
	if err != nil {
		writeError(w, http.StatusBadRequest, "read body")
		return
	}
	sig := strings.TrimSpace(r.Header.Get(onboardingCallbackSigHeader))
	if !verifyOnboardingHMAC(body, sig, secret) {
		writeError(w, http.StatusUnauthorized, "bad signature")
		return
	}
	var req onboardingCallbackBody
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.IntakeID = strings.TrimSpace(req.IntakeID)
	req.Action = strings.TrimSpace(req.Action)
	if req.IntakeID == "" || req.Action == "" {
		writeError(w, http.StatusBadRequest, "intake_id and action required")
		return
	}
	if absInt64(time.Now().Unix()-req.Timestamp) > int64(onboardingCallbackMaxSkew.Seconds()) {
		writeError(w, http.StatusUnauthorized, "stale timestamp")
		return
	}

	switch req.Action {
	case "mark_qualified":
		if _, err := h.CompanyIntakes.MarkQualifiedByID(r.Context(), req.IntakeID); err != nil {
			if errors.Is(err, store.ErrCompanyIntakeNotFound) {
				writeError(w, http.StatusNotFound, "intake not found or not in qualifiable state")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)

	case "submit_intake":
		req.ContactEmail = strings.TrimSpace(strings.ToLower(req.ContactEmail))
		req.ContactWhatsApp = strings.TrimSpace(req.ContactWhatsApp)
		if req.ContactEmail == "" {
			writeError(w, http.StatusBadRequest, "contact_email required for submit_intake")
			return
		}
		if _, err := h.CompanyIntakes.SetContactInfo(
			r.Context(),
			req.IntakeID,
			req.ContactEmail,
			req.ContactWhatsApp,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "set contact info: "+err.Error())
			return
		}
		submitted, err := h.CompanyIntakes.SubmitByID(r.Context(), req.IntakeID)
		if err != nil {
			if errors.Is(err, store.ErrCompanyIntakeNotFound) {
				writeError(w, http.StatusNotFound, "intake not found or already submitted")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// Auto-invalidate any magic links tied to this intake. The summary
		// shown to the visitor on a subsequent click is built from the intake's
		// own fields (company + contact) so the message is personalised.
		if h.MagicLinks != nil {
			summary := buildMagicLinkSummaryFromIntake(submitted)
			if rows, mErr := h.MagicLinks.MarkConsumedByIntake(r.Context(), submitted.ID, summary); mErr != nil {
				log.Printf("onboarding-callback: invalidate magic links failed (intake=%s): %v", submitted.ID, mErr)
			} else if rows > 0 {
				log.Printf("onboarding-callback: invalidated %d magic link(s) for intake=%s", rows, submitted.ID)
			}
		}

		resp := map[string]any{"status": "submitted"}
		// Same auto-provision shape as handleSubmitCompanyIntake — see
		// company_intakes.go:310-341.
		notLinked := submitted.LinkedTenantID == nil || *submitted.LinkedTenantID == ""
		if h.AutoProvision != nil && notLinked && submitted.ContactEmail != "" && submitted.CompanyName != "" {
			// Prefer the visitor IP the skill captured (req.VisitorIP) over
			// the loopback the controlplane sees on the server-to-server
			// callback — the per-IP rate limiter is meaningless if every
			// callback collapses to one key. stripPort normalizes both.
			rateLimitIP := stripPort(strings.TrimSpace(req.VisitorIP))
			if rateLimitIP == "" {
				rateLimitIP = clientIP(r)
			}
			log.Printf("onboarding-callback: AutoProvision.Run starting intake=%s company=%q email=%q ip=%s",
				req.IntakeID, submitted.CompanyName, submitted.ContactEmail, rateLimitIP)
			res, perr := h.AutoProvision.Run(r.Context(), submitted, rateLimitIP)
			switch {
			case perr != nil:
				log.Printf("onboarding-callback: AutoProvision.Run ERR intake=%s err=%v", req.IntakeID, perr)
				resp["provision_error"] = perr.Error()
			case res.AlreadyExists:
				resp["tenant_already_exists"] = true
				resp["url"] = res.URL
				resp["subdomain"] = res.Subdomain
			default:
				resp["tenant_provisioned"] = true
				resp["url"] = res.URL
				resp["subdomain"] = res.Subdomain
				resp["login_mode"] = res.LoginMode
				if res.InitialPassword != "" {
					resp["initial_password"] = res.InitialPassword
					resp["check_email"] = true
				} else if res.LoginMode == "magic_link" {
					resp["check_email"] = true
				}
			}
		}
		writeJSON(w, http.StatusOK, resp)

	default:
		writeError(w, http.StatusBadRequest, "unknown action: "+req.Action)
	}
}

// verifyOnboardingHMAC returns true iff sigHex is the hex-encoded HMAC-SHA256
// of body using secret. Constant-time compare.
func verifyOnboardingHMAC(body []byte, sigHex, secret string) bool {
	if sigHex == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	got, err := hex.DecodeString(sigHex)
	if err != nil {
		return false
	}
	return hmac.Equal(expected, got)
}

func absInt64(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}

// buildMagicLinkSummaryFromIntake assembles the personalised message shown
// to a visitor who clicks an already-consumed magic link. Pulls the
// freshest contact info from the submitted intake so the visitor sees their
// own name + which email/whatsapp will receive the follow-up.
func buildMagicLinkSummaryFromIntake(intake *store.CompanyIntake) string {
	if intake == nil {
		return ""
	}
	parts := []string{}
	if name := strings.TrimSpace(intake.ContactName); name != "" {
		parts = append(parts, "Olá "+name+"!")
	}
	if company := strings.TrimSpace(intake.CompanyName); company != "" {
		parts = append(parts, "Recebemos as informações da "+company+".")
	}
	channels := []string{}
	if email := strings.TrimSpace(intake.ContactEmail); email != "" {
		channels = append(channels, "e-mail "+email)
	}
	if wa := strings.TrimSpace(intake.ContactWhatsApp); wa != "" {
		channels = append(channels, "WhatsApp "+wa)
	}
	if len(channels) > 0 {
		parts = append(parts, "Vamos retornar pelo "+strings.Join(channels, " e ")+".")
	}
	return strings.Join(parts, " ")
}
