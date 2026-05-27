package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// jotaduoWARevokeTimeout caps each revoke call. The promote handler runs
// inline; a stalled sidecar shouldn't block the response forever.
const jotaduoWARevokeTimeout = 5 * time.Second

// jotaduoWARevokeBody is the canonical body sent with the DELETE so HMAC
// verification on the sidecar has something to sign. Body content isn't
// inspected by handleRoutingByTenant — only the path tenant_id matters.
var jotaduoWARevokeBody = []byte(`{}`)

// jotaduoWAHTTPClient is the package-level client used for revoke calls.
// Swappable in tests; see jotaduo_wa_client_test.go.
var jotaduoWAHTTPClient = &http.Client{Timeout: jotaduoWARevokeTimeout}

// RevokeJotaduoWARouting tells the jotaduo-wa sidecar to drop every
// phone→tenant route for tenantID. Called at promotion time so a freshly-
// promoted cliente stops receiving inbound from the institutional WA even
// if a lead replies later. Defense in depth: the provisioner's recreate
// already strips JOTADUO_WA_HMAC_SECRET from the cliente container env so
// the launcher endpoint would 503 the inbound anyway — this prevents the
// sidecar from even firing the webhook.
//
// Best-effort by design:
//   - When the controlplane has no JotaduoWAHMACSecret configured (pre-
//     fatia-1 deployments), this returns nil silently — the sidecar isn't
//     part of the stack, nothing to revoke.
//   - When the sidecar is configured but the call fails, the error is
//     returned so the caller can log it. Promote MUST NOT abort because of
//     a sidecar issue — the DB row + container recreate are the source of
//     truth, the routing revoke is hygiene.
func (h *Handler) RevokeJotaduoWARouting(ctx context.Context, tenantID string) error {
	secret := strings.TrimSpace(h.Cfg.JotaduoWAHMACSecret)
	if secret == "" {
		// Sidecar not deployed. No-op.
		return nil
	}
	baseURL := strings.TrimSpace(h.Cfg.JotaduoWAURL)
	if baseURL == "" {
		return errors.New("JotaduoWAURL not configured (HMAC secret is set — likely partial config)")
	}
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return errors.New("tenant_id required")
	}

	// PathEscape so tenant ids with unusual chars don't break URL parsing.
	// All current tenant ids are alphanumeric + hyphen but the helper has
	// to keep working if that ever loosens.
	endpoint := strings.TrimRight(baseURL, "/") +
		"/internal/wa/routing/by-tenant/" + url.PathEscape(tenantID)

	revokeCtx, cancel := context.WithTimeout(ctx, jotaduoWARevokeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(revokeCtx, http.MethodDelete, endpoint, bytes.NewReader(jotaduoWARevokeBody))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Jotaduo-WA-Signature", signRevokeBody(jotaduoWARevokeBody, secret))

	resp, err := jotaduoWAHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("call sidecar: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return fmt.Errorf("sidecar returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
}

// signRevokeBody computes the same HMAC-SHA256 hex digest the sidecar's
// requireHMAC middleware verifies (mirrors verifyHMAC in
// internal/jotaduowa/server.go).
func signRevokeBody(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}
