package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// NotificationKind é um dos três tipos de notificação que agentes podem
// disparar pro usuário. Mantenha sincronizado com NotificationKind no
// web/frontend/src/api/notifications.ts.
type NotificationKind string

const (
	NotificationKindData    NotificationKind = "data"
	NotificationKindWarning NotificationKind = "warning"
	NotificationKindBilling NotificationKind = "billing"
	// NotificationKindApproval marks a notification that requires an owner
	// decision (approve/reject) — used by the v2.0 assistant→attendant config
	// proposal flow. The CTA points at the pending proposal so the dashboard
	// can render an approve/reject card.
	NotificationKindApproval NotificationKind = "approval"
)

func (k NotificationKind) valid() bool {
	switch k {
	case NotificationKindData, NotificationKindWarning, NotificationKindBilling, NotificationKindApproval:
		return true
	}
	return false
}

// Notification é a payload que vai pro frontend (snake_case via tags).
// IDs e timestamps são preenchidos pelo backend; cliente (tool / agente)
// só fornece kind, title, body, agent_id, cta_*.
type Notification struct {
	ID        string           `json:"id"`
	Kind      NotificationKind `json:"kind"`
	Title     string           `json:"title"`
	Body      string           `json:"body,omitempty"`
	AgentID   string           `json:"agent_id,omitempty"`
	CTAURL    string           `json:"cta_url,omitempty"`
	CTALabel  string           `json:"cta_label,omitempty"`
	CreatedAt time.Time        `json:"created_at"`
	ReadAt    *time.Time       `json:"read_at"`
}

// NotificationCreateRequest é o que tools/agentes POSTam pra criar.
// Title é obrigatório (max 120 chars); body opcional (max 600 chars).
type NotificationCreateRequest struct {
	Kind     NotificationKind `json:"kind"`
	Title    string           `json:"title"`
	Body     string           `json:"body,omitempty"`
	AgentID  string           `json:"agent_id,omitempty"`
	CTAURL   string           `json:"cta_url,omitempty"`
	CTALabel string           `json:"cta_label,omitempty"`
}

const (
	notificationMaxTitleLen = 120
	notificationMaxBodyLen  = 600
	notificationDefaultCap  = 500 // ring buffer cap; oldest dropped quando estoura
)

// notificationStore é um in-memory store thread-safe. Suficiente pro MVP:
// notificações são transitórias (mostradas até dismiss / mark-all-read);
// um restart do launcher derruba as pendentes mas não há regressão de
// dados duros. Próxima iteração: SQLite em $PICOCLAW_HOME/notifications.db
// se quisermos persistência cross-restart.
type notificationStore struct {
	mu    sync.RWMutex
	items []*Notification // ordem cronológica decrescente (mais novo no topo)
	cap   int
}

func newNotificationStore() *notificationStore {
	return &notificationStore{cap: notificationDefaultCap}
}

func (s *notificationStore) add(n *Notification) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items = append([]*Notification{n}, s.items...)
	if len(s.items) > s.cap {
		s.items = s.items[:s.cap]
	}
}

func (s *notificationStore) list(unreadOnly bool, limit int) ([]*Notification, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Notification, 0, len(s.items))
	unread := 0
	for _, n := range s.items {
		if n.ReadAt == nil {
			unread++
		}
		if unreadOnly && n.ReadAt != nil {
			continue
		}
		out = append(out, n)
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, unread
}

func (s *notificationStore) markRead(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, n := range s.items {
		if n.ID == id {
			if n.ReadAt == nil {
				now := time.Now().UTC()
				n.ReadAt = &now
			}
			return true
		}
	}
	return false
}

func (s *notificationStore) markAllRead() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	count := 0
	for _, n := range s.items {
		if n.ReadAt == nil {
			n.ReadAt = &now
			count++
		}
	}
	return count
}

func (s *notificationStore) delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, n := range s.items {
		if n.ID == id {
			s.items = append(s.items[:i], s.items[i+1:]...)
			return true
		}
	}
	return false
}

// registerNotificationRoutes monta os endpoints REST do painel de
// notificações no mux do launcher backend.
//
//   GET    /api/notifications              lista + unread_count
//   POST   /api/notifications              cria (tools/agentes)
//   POST   /api/notifications/{id}/read    marca lida
//   POST   /api/notifications/read-all     marca tudo lido
//   DELETE /api/notifications/{id}         dispensa permanente
func (h *Handler) registerNotificationRoutes(mux *http.ServeMux) {
	if h.notifications == nil {
		h.notifications = newNotificationStore()
	}
	mux.HandleFunc("/api/notifications", h.handleNotifications)
	mux.HandleFunc("/api/notifications/read-all", h.handleNotificationsReadAll)
	mux.HandleFunc("/api/notifications/", h.handleNotificationByID)
}

func (h *Handler) handleNotifications(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleNotificationsList(w, r)
	case http.MethodPost:
		h.handleNotificationsCreate(w, r)
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleNotificationsList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	unread := q.Get("unread") == "true"
	limit := 0
	if s := q.Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			limit = n
		}
	}
	items, unreadCount := h.notifications.list(unread, limit)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Notifications []*Notification `json:"notifications"`
		UnreadCount   int             `json:"unread_count"`
	}{Notifications: items, UnreadCount: unreadCount})
}

func (h *Handler) handleNotificationsCreate(w http.ResponseWriter, r *http.Request) {
	var req NotificationCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Kind == "" {
		req.Kind = NotificationKindData
	}
	if !req.Kind.valid() {
		http.Error(w, "kind must be one of: data, warning, billing", http.StatusBadRequest)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}
	if len(req.Title) > notificationMaxTitleLen {
		http.Error(w, fmt.Sprintf("title exceeds %d chars", notificationMaxTitleLen), http.StatusBadRequest)
		return
	}
	if len(req.Body) > notificationMaxBodyLen {
		http.Error(w, fmt.Sprintf("body exceeds %d chars", notificationMaxBodyLen), http.StatusBadRequest)
		return
	}
	n := &Notification{
		ID:        uuid.NewString(),
		Kind:      req.Kind,
		Title:     req.Title,
		Body:      strings.TrimSpace(req.Body),
		AgentID:   strings.TrimSpace(req.AgentID),
		CTAURL:    strings.TrimSpace(req.CTAURL),
		CTALabel:  strings.TrimSpace(req.CTALabel),
		CreatedAt: time.Now().UTC(),
	}
	h.notifications.add(n)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(n)
}

func (h *Handler) handleNotificationByID(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/notifications/")
	if rest == "" || strings.Contains(rest, "/") && !strings.HasSuffix(rest, "/read") {
		http.NotFound(w, r)
		return
	}
	if strings.HasSuffix(rest, "/read") {
		id := strings.TrimSuffix(rest, "/read")
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !h.notifications.markRead(id) {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// DELETE /api/notifications/{id}
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", "DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !h.notifications.delete(rest) {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleNotificationsReadAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	count := h.notifications.markAllRead()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]int{"marked": count})
}
