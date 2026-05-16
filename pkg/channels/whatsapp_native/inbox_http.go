//go:build whatsapp_native

package whatsapp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"

	"github.com/sipeed/picoclaw/pkg/channels/whatsapp_native/inbox"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// inboxHTTPHandler routes /whatsapp_native/inbox/* to the appropriate
// chat/message/pause/send/SSE endpoint. Mounted by the channel manager via the
// HealthChecker interface (we reuse it as a generic prefix handler).
type inboxHTTPHandler struct {
	channel  *WhatsAppNativeChannel
	store    *inbox.Store
	pubsub   *inboxPubSub
	avatarMu sync.Mutex
}

const inboxBasePath = "/whatsapp_native/inbox"

// ServeHTTP is the entry point — strips the prefix and dispatches.
func (h *inboxHTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	sub := strings.TrimPrefix(r.URL.Path, inboxBasePath)
	sub = strings.TrimPrefix(sub, "/")

	switch {
	case sub == "chats" && r.Method == http.MethodGet:
		h.listChats(w, r)
	case sub == "reports" && r.Method == http.MethodGet:
		h.getReport(w, r)
	case sub == "events" && r.Method == http.MethodGet:
		h.streamEvents(w, r)
	case strings.HasPrefix(sub, "chats/"):
		h.routeChatSubresource(w, r, strings.TrimPrefix(sub, "chats/"))
	default:
		http.NotFound(w, r)
	}
}

func (h *inboxHTTPHandler) routeChatSubresource(w http.ResponseWriter, r *http.Request, rest string) {
	// Patterns:
	//   {jid}                  GET  → chat detail
	//   {jid}/messages         GET  → list messages
	//   {jid}/pause            POST → toggle pause
	//   {jid}/send             POST → send manual message
	//   {jid}/read             POST → mark as read
	//   {jid}/avatar           GET  → fetch/cache avatar info
	//   {jid}/profile          GET/PUT → CRM-light contact profile
	//   {jid}/insights         GET → latest structured extraction
	parts := strings.SplitN(rest, "/", 2)
	if parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	jid := parts[0]
	tail := ""
	if len(parts) == 2 {
		tail = parts[1]
	}
	switch {
	case tail == "" && r.Method == http.MethodGet:
		h.getChat(w, r, jid)
	case tail == "messages" && r.Method == http.MethodGet:
		h.listMessages(w, r, jid)
	case tail == "pause" && r.Method == http.MethodPost:
		h.setPause(w, r, jid)
	case tail == "send" && r.Method == http.MethodPost:
		h.sendManual(w, r, jid)
	case tail == "read" && r.Method == http.MethodPost:
		h.markRead(w, r, jid)
	case tail == "avatar" && r.Method == http.MethodGet:
		h.fetchAvatar(w, r, jid)
	case tail == "profile" && r.Method == http.MethodGet:
		h.getProfile(w, r, jid)
	case tail == "profile" && r.Method == http.MethodPut:
		h.saveProfile(w, r, jid)
	case tail == "insights" && r.Method == http.MethodGet:
		h.getInsights(w, r, jid)
	default:
		http.NotFound(w, r)
	}
}

// GET /whatsapp_native/inbox/chats?limit=N
func (h *inboxHTTPHandler) listChats(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	chats, err := h.store.ListChats(r.Context(), limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"chats": chats})
}

// GET /whatsapp_native/inbox/reports?from=unix_ms&to=unix_ms
func (h *inboxHTTPHandler) getReport(w http.ResponseWriter, r *http.Request) {
	from, _ := strconv.ParseInt(r.URL.Query().Get("from"), 10, 64)
	to, _ := strconv.ParseInt(r.URL.Query().Get("to"), 10, 64)
	report, err := h.store.BuildReport(r.Context(), from, to)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, report)
}

// GET /whatsapp_native/inbox/chats/{jid}
func (h *inboxHTTPHandler) getChat(w http.ResponseWriter, r *http.Request, jid string) {
	c, err := h.store.GetChat(r.Context(), jid)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if c == nil {
		jsonError(w, http.StatusNotFound, "chat not found")
		return
	}
	writeJSON(w, c)
}

// GET /whatsapp_native/inbox/chats/{jid}/messages?limit=N
func (h *inboxHTTPHandler) listMessages(w http.ResponseWriter, r *http.Request, jid string) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	msgs, err := h.store.ListMessages(r.Context(), jid, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"messages": msgs})
}

// GET /whatsapp_native/inbox/chats/{jid}/profile
func (h *inboxHTTPHandler) getProfile(w http.ResponseWriter, r *http.Request, jid string) {
	profile, err := h.store.GetContactProfile(r.Context(), jid)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if profile == nil {
		jsonError(w, http.StatusNotFound, "profile not found")
		return
	}
	writeJSON(w, profile)
}

// PUT /whatsapp_native/inbox/chats/{jid}/profile
func (h *inboxHTTPHandler) saveProfile(w http.ResponseWriter, r *http.Request, jid string) {
	var profile inbox.ContactProfile
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&profile); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	profile.ChatJID = jid
	saved, err := h.store.SaveContactProfile(r.Context(), profile)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	chat, _ := h.store.GetChat(r.Context(), jid)
	if chat != nil {
		h.pubsub.Publish(inboxEvent{Kind: "chat_update", Chat: chat})
	}
	writeJSON(w, saved)
}

// GET /whatsapp_native/inbox/chats/{jid}/insights
func (h *inboxHTTPHandler) getInsights(w http.ResponseWriter, r *http.Request, jid string) {
	insight, err := h.store.GetConversationInsight(r.Context(), jid)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if insight == nil {
		jsonError(w, http.StatusNotFound, "insights not found")
		return
	}
	writeJSON(w, insight)
}

// POST /whatsapp_native/inbox/chats/{jid}/pause   body: {"paused": true}
func (h *inboxHTTPHandler) setPause(w http.ResponseWriter, r *http.Request, jid string) {
	var body struct {
		Paused bool `json:"paused"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	if err := h.store.SetPaused(r.Context(), jid, body.Paused); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	chat, _ := h.store.GetChat(r.Context(), jid)
	if chat != nil {
		h.pubsub.Publish(inboxEvent{Kind: "chat_update", Chat: chat})
	}
	writeJSON(w, map[string]any{"jid": jid, "paused": body.Paused})
}

// POST /whatsapp_native/inbox/chats/{jid}/send   body: {"content": "..."}
func (h *inboxHTTPHandler) sendManual(w http.ResponseWriter, r *http.Request, jid string) {
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	content := strings.TrimSpace(body.Content)
	if content == "" {
		jsonError(w, http.StatusBadRequest, "content is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := h.channel.SendManual(ctx, jid, content); err != nil {
		jsonError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, map[string]any{"status": "sent"})
}

// POST /whatsapp_native/inbox/chats/{jid}/read
func (h *inboxHTTPHandler) markRead(w http.ResponseWriter, r *http.Request, jid string) {
	if err := h.store.MarkRead(r.Context(), jid); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	chat, _ := h.store.GetChat(r.Context(), jid)
	if chat != nil {
		h.pubsub.Publish(inboxEvent{Kind: "chat_update", Chat: chat})
	}
	writeJSON(w, map[string]any{"status": "ok"})
}

// GET /whatsapp_native/inbox/chats/{jid}/avatar
//
// Returns the cached avatar URL or asks whatsmeow for a fresh one when the
// cached entry is empty. The URL itself points to WhatsApp's CDN and is
// short-lived; the frontend should follow the redirect / cache the bytes.
func (h *inboxHTTPHandler) fetchAvatar(w http.ResponseWriter, r *http.Request, jid string) {
	chat, err := h.store.GetChat(r.Context(), jid)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if chat == nil {
		jsonError(w, http.StatusNotFound, "chat not found")
		return
	}
	if chat.AvatarURL != "" {
		writeJSON(w, map[string]any{"url": chat.AvatarURL, "avatar_id": chat.AvatarID, "cached": true})
		return
	}

	client := h.channel.Client()
	if client == nil {
		jsonError(w, http.StatusServiceUnavailable, "whatsapp client not ready")
		return
	}

	h.avatarMu.Lock()
	defer h.avatarMu.Unlock()
	// Re-check after acquiring the lock to avoid duplicate fetches when many
	// dashboards open the same chat simultaneously.
	if chat, err = h.store.GetChat(r.Context(), jid); err == nil && chat != nil && chat.AvatarURL != "" {
		writeJSON(w, map[string]any{"url": chat.AvatarURL, "avatar_id": chat.AvatarID, "cached": true})
		return
	}

	parsedJID, err := types.ParseJID(jid)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid jid: "+err.Error())
		return
	}
	pic, err := client.GetProfilePictureInfo(r.Context(), parsedJID, &whatsmeow.GetProfilePictureParams{Preview: false})
	if err != nil {
		if errors.Is(err, whatsmeow.ErrProfilePictureNotSet) || errors.Is(err, whatsmeow.ErrProfilePictureUnauthorized) {
			writeJSON(w, map[string]any{"url": "", "cached": false, "reason": err.Error()})
			return
		}
		jsonError(w, http.StatusBadGateway, err.Error())
		return
	}
	if pic == nil {
		writeJSON(w, map[string]any{"url": "", "cached": false})
		return
	}
	if err := h.store.SetAvatar(r.Context(), jid, pic.URL, pic.ID); err != nil {
		logger.WarnCF("whatsapp", "inbox: failed to cache avatar URL", map[string]any{"jid": jid, "error": err.Error()})
	}
	writeJSON(w, map[string]any{"url": pic.URL, "avatar_id": pic.ID, "cached": false})
}

// GET /whatsapp_native/inbox/events  (text/event-stream)
//
// Server-Sent Events stream of {kind, chat?, message?} objects. The client
// should attach with EventSource and reconnect on disconnect; events that
// arrive while disconnected are not replayed (clients re-fetch chats on
// reconnect).
func (h *inboxHTTPHandler) streamEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-store")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	ch, unsubscribe := h.pubsub.Subscribe()
	defer unsubscribe()

	// Initial comment + retry hint so EventSource reconnects after 3s if the
	// process dies. Comments (lines starting with ":") are ignored by clients.
	fmt.Fprint(w, ": ok\nretry: 3000\n\n")
	flusher.Flush()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			// Keep-alive to defeat proxy idle timeouts.
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case evt, open := <-ch:
			if !open {
				return
			}
			data, err := json.Marshal(evt)
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Kind, data); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		logger.WarnCF("whatsapp", "inbox: failed to encode response", map[string]any{"error": err.Error()})
	}
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
