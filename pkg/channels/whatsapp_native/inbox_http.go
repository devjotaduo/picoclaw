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
	"time"

	"go.mau.fi/whatsmeow"

	"github.com/sipeed/picoclaw/pkg/channels/whatsapp_native/inbox"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// inboxHTTPHandler routes /whatsapp_native/inbox/* to the appropriate
// chat/message/pause/send/SSE endpoint. Mounted by the channel manager via the
// HealthChecker interface (we reuse it as a generic prefix handler).
type inboxHTTPHandler struct {
	channel *WhatsAppNativeChannel
	store   *inbox.Store
	pubsub  *inboxPubSub
	avatars *avatarFetcher
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
	//   {jid}/avatar           GET  → fetch/cache avatar info (cache-first)
	//   {jid}/avatar           POST → force-refresh avatar from whatsmeow
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
	case tail == "unread" && r.Method == http.MethodPost:
		h.markUnread(w, r, jid)
	case tail == "avatar" && r.Method == http.MethodGet:
		h.fetchAvatar(w, r, jid, false)
	case tail == "avatar" && r.Method == http.MethodPost:
		h.fetchAvatar(w, r, jid, true)
	case tail == "profile" && r.Method == http.MethodGet:
		h.getProfile(w, r, jid)
	case tail == "profile" && r.Method == http.MethodPut:
		h.saveProfile(w, r, jid)
	case tail == "insights" && r.Method == http.MethodGet:
		h.getInsights(w, r, jid)
	case tail == "notes" && r.Method == http.MethodGet:
		h.listNotes(w, r, jid)
	case tail == "notes" && r.Method == http.MethodPost:
		h.addNote(w, r, jid)
	case strings.HasPrefix(tail, "notes/") && r.Method == http.MethodDelete:
		idStr := strings.TrimPrefix(tail, "notes/")
		h.deleteNote(w, r, jid, idStr)
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
	op := operatorFromRequest(r)
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := h.channel.SendManual(ctx, jid, content, op); err != nil {
		jsonError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, map[string]any{"status": "sent"})
}

func operatorFromRequest(r *http.Request) Operator {
	const (
		headerUserID    = "X-Picoclaw-Gateway-User"
		headerUserEmail = "X-Picoclaw-Gateway-Email"
	)
	id := strings.TrimSpace(r.Header.Get(headerUserID))
	email := strings.TrimSpace(r.Header.Get(headerUserEmail))
	if id == "" && email == "" {
		return Operator{}
	}
	return Operator{ID: id, Name: email}
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

// POST /whatsapp_native/inbox/chats/{jid}/unread — operator-only "snooze".
// Bumps unread_count to MAX(1, current), and publishes a chat_update so
// every connected dashboard tab picks it up immediately.
func (h *inboxHTTPHandler) markUnread(w http.ResponseWriter, r *http.Request, jid string) {
	if err := h.store.MarkUnread(r.Context(), jid); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	chat, _ := h.store.GetChat(r.Context(), jid)
	if chat != nil {
		h.pubsub.Publish(inboxEvent{Kind: "chat_update", Chat: chat})
	}
	unread := 0
	if chat != nil {
		unread = chat.UnreadCount
	}
	writeJSON(w, map[string]any{"status": "ok", "unread_count": unread})
}

// GET /whatsapp_native/inbox/chats/{jid}/notes?limit=N
func (h *inboxHTTPHandler) listNotes(w http.ResponseWriter, r *http.Request, jid string) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	notes, err := h.store.ListInternalNotes(r.Context(), jid, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]any{"notes": notes})
}

// POST /whatsapp_native/inbox/chats/{jid}/notes  body: {"content","author"}
func (h *inboxHTTPHandler) addNote(w http.ResponseWriter, r *http.Request, jid string) {
	var body struct {
		Content string `json:"content"`
		Author  string `json:"author"`
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
	author := strings.TrimSpace(body.Author)
	if author == "" {
		author = "Operador"
	}
	note, err := h.store.AddInternalNote(r.Context(), inbox.InternalNote{
		ChatJID: jid,
		Content: content,
		Author:  author,
	})
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, note)
}

// DELETE /whatsapp_native/inbox/chats/{jid}/notes/{id}
func (h *inboxHTTPHandler) deleteNote(w http.ResponseWriter, r *http.Request, jid, idStr string) {
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		jsonError(w, http.StatusBadRequest, "invalid note id")
		return
	}
	if err := h.store.DeleteInternalNote(r.Context(), jid, id); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET  /whatsapp_native/inbox/chats/{jid}/avatar  → cache-first
// POST /whatsapp_native/inbox/chats/{jid}/avatar  → force refresh
//
// Returns the cached avatar URL or asks whatsmeow for a fresh one. The URL
// itself points to WhatsApp's CDN and is short-lived; the frontend should
// follow the redirect or cache the bytes. Force refresh bypasses cache and
// also bypasses the per-JID throttle (used after profile-picture errors or
// when the dashboard hits "reload").
func (h *inboxHTTPHandler) fetchAvatar(w http.ResponseWriter, r *http.Request, jid string, force bool) {
	chat, err := h.store.GetChat(r.Context(), jid)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if chat == nil {
		jsonError(w, http.StatusNotFound, "chat not found")
		return
	}
	if !force && chat.AvatarURL != "" {
		writeJSON(w, map[string]any{"url": chat.AvatarURL, "avatar_id": chat.AvatarID, "cached": true})
		return
	}

	if h.avatars == nil {
		jsonError(w, http.StatusServiceUnavailable, "avatar fetcher disabled")
		return
	}
	if client := h.channel.Client(); client == nil {
		jsonError(w, http.StatusServiceUnavailable, "whatsapp client not ready")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	updated, err := h.avatars.Refresh(ctx, jid, force)
	if err != nil {
		if errors.Is(err, whatsmeow.ErrProfilePictureNotSet) ||
			errors.Is(err, whatsmeow.ErrProfilePictureUnauthorized) {
			writeJSON(w, map[string]any{"url": "", "avatar_id": "", "cached": false, "reason": err.Error()})
			return
		}
		logger.WarnCF("whatsapp", "inbox: failed to refresh avatar", map[string]any{"jid": jid, "error": err.Error()})
		jsonError(w, http.StatusBadGateway, err.Error())
		return
	}
	if updated == nil {
		writeJSON(w, map[string]any{"url": "", "avatar_id": "", "cached": false})
		return
	}
	writeJSON(w, map[string]any{"url": updated.AvatarURL, "avatar_id": updated.AvatarID, "cached": false})
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
