package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// jotaduoWAInbox is where the launcher appends each inbound message from the
// jotaduo-wa sidecar. Lives in workspace/state/ alongside other state
// machines (onboarding.json, etc.) so it's part of the tenant's snapshot.
// One line per message (JSONL) so Catarina's reader skill (follow-up PR)
// can tail-read without parsing the whole file.
const jotaduoWAInbox = "workspace/state/jotaduo-wa-inbox.jsonl"

// jotaduoWAInboundSigHeader + jotaduoWAInboundMaxSkew mirror the sidecar's
// dispatcher (internal/jotaduowa/dispatcher.go). Same shared secret as the
// outbound skill (JOTADUO_WA_HMAC_SECRET, injected by the provisioner only
// for public tenants — see internal/saas/tenant/provisioner.go).
const (
	jotaduoWAInboundSigHeader = "X-Jotaduo-WA-Signature"
	jotaduoWAInboundMaxSkew   = 5 * time.Minute
	jotaduoWAInboundMaxBody   = 1 << 20 // 1 MiB
)

func (h *Handler) registerJotaduoWAInboundRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/launcher/jotaduo-wa-inbound", h.handleJotaduoWAInbound)
}

// jotaduoWAInboundBody is the contract with internal/jotaduowa.Dispatcher.
// Keep the JSON tags in sync — the dispatcher signs the body verbatim, so
// any reorder/rename here breaks signatures across containers.
type jotaduoWAInboundBody struct {
	TenantID  string `json:"tenant_id"`
	FromPhone string `json:"from_phone"`
	FromName  string `json:"from_name,omitempty"`
	ChatJID   string `json:"chat_jid,omitempty"`
	MessageID string `json:"message_id,omitempty"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
	SentAt    int64  `json:"sent_at"`
}

// handleJotaduoWAInbound persists an inbound WhatsApp message routed by the
// jotaduo-wa sidecar. Authenticated via HMAC-SHA256 of the raw body, with a
// fresh-timestamp check to prevent replay. Body is appended to a JSONL file
// in workspace/state/; Catarina reads it via her own skill (next PR).
//
// Returns 200 with {"status":"ok"} on success, 401 for auth issues, 503 if
// the tenant isn't configured for jotaduo-wa (cliente tenants by design).
// The sidecar logs non-2xx — visible at adm.<base>/ops without exec'ing in.
func (h *Handler) handleJotaduoWAInbound(w http.ResponseWriter, r *http.Request) {
	secret := strings.TrimSpace(os.Getenv("JOTADUO_WA_HMAC_SECRET"))
	if secret == "" {
		// Cliente tenants (post-promotion) don't get the env injected. The
		// sidecar SHOULD have stopped routing to them at promote time (the
		// controlplane DELETEs by-tenant routes in fatia 5), but if a stale
		// route survives we fail closed here.
		http.Error(w, `{"error":"jotaduo-wa not configured for this tenant"}`, http.StatusServiceUnavailable)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, jotaduoWAInboundMaxBody))
	if err != nil {
		http.Error(w, `{"error":"read body"}`, http.StatusBadRequest)
		return
	}
	sig := strings.TrimSpace(r.Header.Get(jotaduoWAInboundSigHeader))
	if !verifyJotaduoWAInboundHMAC(body, sig, secret) {
		http.Error(w, `{"error":"bad signature"}`, http.StatusUnauthorized)
		return
	}

	var msg jotaduoWAInboundBody
	if err := json.Unmarshal(body, &msg); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if msg.FromPhone == "" || msg.Content == "" {
		http.Error(w, `{"error":"from_phone and content required"}`, http.StatusBadRequest)
		return
	}
	if absInt64Inbox(time.Now().Unix()-msg.SentAt) > int64(jotaduoWAInboundMaxSkew.Seconds()) {
		http.Error(w, `{"error":"stale timestamp"}`, http.StatusUnauthorized)
		return
	}
	if msg.TenantID != "" && os.Getenv("PICOCLAW_TENANT_ID") != "" && msg.TenantID != os.Getenv("PICOCLAW_TENANT_ID") {
		// Misrouted: sidecar thought this message belonged to a different
		// tenant. Should never happen with a healthy routing table, but a
		// hard reject prevents accidental cross-tenant data leak. The
		// sidecar will see 401 + the right message in its log.
		log.Printf("jotaduo-wa-inbound: tenant_id mismatch want=%s got=%s — possible routing corruption",
			os.Getenv("PICOCLAW_TENANT_ID"), msg.TenantID)
		http.Error(w, `{"error":"tenant_id mismatch"}`, http.StatusUnauthorized)
		return
	}

	if err := h.appendJotaduoWAInbox(body); err != nil {
		log.Printf("jotaduo-wa-inbound: append failed: %v", err)
		http.Error(w, `{"error":"persist"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// appendJotaduoWAInbox writes one line (the signed body, verbatim) to the
// inbox JSONL. Verbatim because we want byte-for-byte fidelity with what the
// sidecar sent — Catarina's reader can re-validate or re-sign if needed.
func (h *Handler) appendJotaduoWAInbox(line []byte) error {
	home := h.homeDir()
	if home == "" {
		return errors.New("PICOCLAW_HOME unknown — cannot resolve inbox path")
	}
	path := filepath.Join(home, jotaduoWAInbox)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir state/: %w", err)
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(line); err != nil {
		return err
	}
	_, err = f.Write([]byte("\n"))
	return err
}

func verifyJotaduoWAInboundHMAC(body []byte, sigHex, secret string) bool {
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

func absInt64Inbox(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}
