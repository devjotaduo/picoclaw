package jotaduowa

import (
	"bytes"
	"context"
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
)

const (
	// dispatchTimeout caps each outbound POST to a tenant launcher. WhatsApp
	// inbound is best-effort — a tenant launcher that's down/slow shouldn't
	// stall the sidecar's event loop. The next inbound from the same lead
	// will retry naturally.
	dispatchTimeout = 8 * time.Second

	// inboundWebhookPath is what the launcher must register (see
	// web/backend/api/jotaduo_wa_inbound.go).
	inboundWebhookPath = "/api/launcher/jotaduo-wa-inbound"
)

// Dispatcher takes an inbound WhatsApp message from the wrapped channel,
// resolves which tenant owns the sender's phone via the routing store, and
// POSTs an HMAC-signed webhook to that tenant's launcher.
//
// Best-effort by design: a failed dispatch is logged + dropped. The lead's
// next reply will retry. No queue, no DLQ — the sidecar is the front door
// of an async chat surface, not a transaction log.
type Dispatcher struct {
	routing       *Routing
	hmacSecret    string
	tenantURLBase string // e.g. "http://tenant-{id}:18800" — "{id}" is substituted

	http *http.Client
}

// NewDispatcher builds a Dispatcher. tenantURLBase MUST contain "{id}" where
// the tenant id should be substituted. If it doesn't, every dispatch will
// hit the same URL — useful for testing but never what production wants.
func NewDispatcher(routing *Routing, hmacSecret, tenantURLBase string) *Dispatcher {
	return &Dispatcher{
		routing:       routing,
		hmacSecret:    hmacSecret,
		tenantURLBase: tenantURLBase,
		http:          &http.Client{Timeout: dispatchTimeout},
	}
}

// Dispatch is the InboundHandler the sidecar registers on the WhatsApp
// wrapper. Safe for concurrent use; whatsmeow event handlers fire from
// multiple goroutines.
func (d *Dispatcher) Dispatch(msg InboundMessage) {
	ctx, cancel := context.WithTimeout(context.Background(), dispatchTimeout)
	defer cancel()

	tenantID, err := d.routing.Lookup(ctx, msg.SenderJID)
	if err != nil {
		log.Printf("jotaduo-wa: routing lookup failed for sender=%s: %v", msg.SenderJID, err)
		return
	}
	if tenantID == "" {
		// Unsolicited inbound: someone messaging Jotaduo's institutional WA
		// without us having outreached them first. Common cases: cold leads,
		// existing customers replying to a campaign that wasn't routed
		// through here, the operator's own number. Logged at info level so
		// operators can audit without alerting.
		log.Printf("jotaduo-wa: no routing for inbound sender=%s push=%q content=%q (dropped)",
			msg.SenderJID, msg.PushName, truncate(msg.Content, 64))
		return
	}

	url, err := d.urlForTenant(tenantID)
	if err != nil {
		log.Printf("jotaduo-wa: invalid tenant URL pattern for tenant=%s: %v", tenantID, err)
		return
	}

	body, err := json.Marshal(inboundWebhookBody{
		TenantID:  tenantID,
		FromPhone: normalizePhone(msg.SenderJID),
		FromName:  msg.PushName,
		ChatJID:   msg.ChatJID,
		MessageID: msg.MessageID,
		Content:   msg.Content,
		Timestamp: msg.Timestamp.Unix(),
		// Sent now (NOT the WA timestamp) so the launcher's anti-replay
		// check holds even if the WA event was queued in whatsmeow for a
		// few seconds before the handler ran.
		SentAt: time.Now().Unix(),
	})
	if err != nil {
		log.Printf("jotaduo-wa: marshal webhook body failed: %v", err)
		return
	}

	sig := signWebhook(body, d.hmacSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		log.Printf("jotaduo-wa: build webhook request failed tenant=%s: %v", tenantID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(hmacSigHeader, sig)

	resp, err := d.http.Do(req)
	if err != nil {
		log.Printf("jotaduo-wa: webhook POST failed tenant=%s url=%s: %v", tenantID, url, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// Success path is silent. Per-message logging would drown the log
		// during normal operation.
		return
	}

	// Read and log the response for any non-2xx so operators can diagnose
	// auth or schema mismatches without exec'ing into either container.
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	log.Printf("jotaduo-wa: webhook tenant=%s returned %d: %s",
		tenantID, resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
}

// urlForTenant substitutes the tenant id into the pattern. Returns an error
// when the pattern lacks the {id} marker — silent global delivery would be
// a serious cross-tenant leak.
func (d *Dispatcher) urlForTenant(tenantID string) (string, error) {
	if !strings.Contains(d.tenantURLBase, "{id}") {
		return "", errors.New(`tenant URL pattern must contain "{id}"`)
	}
	base := strings.ReplaceAll(d.tenantURLBase, "{id}", tenantID)
	return strings.TrimRight(base, "/") + inboundWebhookPath, nil
}

// inboundWebhookBody is the JSON payload posted to the tenant launcher.
// Exported field names mirror the Go convention; the JSON tags are the
// stable contract — kept short to keep WA notifications cheap.
type inboundWebhookBody struct {
	TenantID  string `json:"tenant_id"`
	FromPhone string `json:"from_phone"`
	FromName  string `json:"from_name,omitempty"`
	ChatJID   string `json:"chat_jid,omitempty"`
	MessageID string `json:"message_id,omitempty"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
	SentAt    int64  `json:"sent_at"`
}

// signWebhook computes the same HMAC-SHA256 hex digest the launcher's
// receiver verifies. Exported in tests via the wrapper below.
func signWebhook(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

