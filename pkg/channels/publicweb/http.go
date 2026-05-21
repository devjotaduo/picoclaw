package publicweb

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/logger"
)

// HTTP entry points for the public-web channel.
//
// Channel implements channels.WebhookHandler so the gateway's shared HTTP
// server (Manager.SetupHTTPServer) auto-registers it under the prefix
// returned by WebhookPath. The launcher reverse-proxies anonymous visitor
// traffic from /api/public/chat[/*] to the gateway port; the controlplane
// tenant gateway (Phase 3) bypasses Supabase JWT auth for tenants whose
// `is_public=true`, so no per-request authentication runs against the
// visitor.

// WebhookPath returns the URL prefix the gateway's HTTP server routes to
// ServeHTTP. The prefix is matched by the manager's net/http mux, so
// subpaths like /api/public/chat/stream and /api/public/chat/health are
// delivered to this handler too.
func (c *Channel) WebhookPath() string {
	return "/api/public/chat"
}

// ServeHTTP dispatches inbound visitor traffic to the right sub-handler:
//
//	POST /api/public/chat              -> accept a new message
//	GET  /api/public/chat/stream       -> SSE outbound stream
//	GET  /api/public/chat/health       -> liveness probe
//
// When the channel is stopped, every request returns 503.
func (c *Channel) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !c.IsRunning() {
		writeJSONError(w, http.StatusServiceUnavailable, "channel stopped")
		return
	}
	p := strings.TrimRight(r.URL.Path, "/")
	switch {
	case p == "/api/public/chat" && r.Method == http.MethodPost:
		c.handlePost(w, r)
	case p == "/api/public/chat/stream" && r.Method == http.MethodGet:
		c.handleStream(w, r)
	case p == "/api/public/chat/health" && r.Method == http.MethodGet:
		c.handleHealth(w, r)
	default:
		writeJSONError(w, http.StatusNotFound, "not found")
	}
}

type postBody struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

func (c *Channel) handlePost(w http.ResponseWriter, r *http.Request) {
	var body postBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.SessionID = strings.TrimSpace(body.SessionID)
	body.Message = strings.TrimSpace(body.Message)
	if body.SessionID == "" || body.Message == "" {
		writeJSONError(w, http.StatusBadRequest, "session_id and message required")
		return
	}
	if c.settings != nil && c.settings.RequireCaptchaHeader &&
		strings.TrimSpace(r.Header.Get("X-Captcha-Token")) == "" {
		writeJSONError(w, http.StatusForbidden, "captcha required")
		return
	}
	ip := clientIPFromRequest(r)
	if err := c.AcceptInbound(r.Context(), body.SessionID, ip, body.Message); err != nil {
		logger.WarnCF("publicweb", "AcceptInbound failed", map[string]any{
			"session": body.SessionID,
			"error":   err.Error(),
		})
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write([]byte(`{"status":"accepted"}`))
}

func (c *Channel) handleStream(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "session_id required")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	stream := c.SubscribeStream(sessionID)
	defer c.UnsubscribeStream(sessionID)

	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	// Initial event so the client knows the stream is open.
	_ = WriteSSEJSON(w, "open", map[string]string{"session_id": sessionID})
	flusher.Flush()

	for {
		select {
		case msg, ok := <-stream:
			if !ok {
				_ = WriteSSEEvent(w, "close", `{"reason":"stream closed"}`)
				flusher.Flush()
				return
			}
			payload := map[string]any{
				"text": msg.Content,
			}
			if err := WriteSSEJSON(w, "message", payload); err != nil {
				return
			}
			flusher.Flush()
		case <-keepalive.C:
			if err := WriteKeepalive(w); err != nil {
				return
			}
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (c *Channel) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ok":true}`))
}

// writeJSONError writes a small JSON error body with the requested status
// code. The message is wrapped in a tiny inline JSON object so the wire
// format is predictable for the launcher proxy and the frontend.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// json.Marshal a one-field object so the message is properly escaped.
	body, _ := json.Marshal(map[string]string{"error": msg})
	_, _ = w.Write(body)
}

// clientIPFromRequest reads X-Forwarded-For first (set by the launcher
// reverse proxy in Phase 5b), then X-Real-IP, then RemoteAddr. Returns the
// empty string if none are present; CanonicalSenderID hashes the result,
// so "" is harmless but produces an identity that won't change as the
// visitor's true IP changes.
func clientIPFromRequest(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		if i := strings.IndexByte(xf, ','); i >= 0 {
			return strings.TrimSpace(xf[:i])
		}
		return strings.TrimSpace(xf)
	}
	if rip := r.Header.Get("X-Real-IP"); rip != "" {
		return strings.TrimSpace(rip)
	}
	return r.RemoteAddr
}
