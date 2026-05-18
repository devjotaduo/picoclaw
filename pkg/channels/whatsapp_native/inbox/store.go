// Package inbox persists WhatsApp inbox state observed by the
// picoclaw-launcher: per-chat metadata (push name, avatar, last preview,
// pause flag) and a rolling history of messages exchanged through the
// whatsapp_native channel, including outbound messages sent manually
// from the dashboard.
//
// The store is SQLite-backed (modernc.org/sqlite, pure Go) and lives
// alongside the whatsmeow session store at $PICOCLAW_HOME/workspace/whatsapp/.
package inbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite" // register "sqlite" driver
)

const (
	// DirectionIn is a message received from the contact.
	DirectionIn = "in"
	// DirectionOut is a message sent to the contact.
	DirectionOut = "out"

	// SourceAgent is an outbound message produced by the agent.
	SourceAgent = "agent"
	// SourceHuman is an outbound message sent manually by an operator.
	SourceHuman = "human"
	// SourceContact is an inbound message received from the contact.
	SourceContact = "contact"

	// DefaultListLimit caps result sizes for the dashboard.
	DefaultListLimit = 200
)

// Store is the inbox persistence layer.
type Store struct {
	db   *sql.DB
	path string
	mu   sync.Mutex
}

// New opens (or creates) the inbox DB under dir.
func New(dir string) (*Store, error) {
	path := filepath.Join(dir, DBFilename)
	s, err := Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %q: %w", path, err)
	}
	return s, nil
}

// Open opens (or creates) the SQLite database at path and migrates the schema.
func Open(path string) (*Store, error) {
	db, err := sql.Open(sqliteDriver, path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	if _, err = db.Exec(sqlCreateSchema); err != nil {
		_ = db.Close()
		return nil, err
	}
	for _, ddl := range []string{
		"ALTER TABLE wa_messages ADD COLUMN operator_id TEXT",
		"ALTER TABLE wa_messages ADD COLUMN operator_name TEXT",
	} {
		if _, err := db.Exec(ddl); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			_ = db.Close()
			return nil, fmt.Errorf("migrate %q: %w", ddl, err)
		}
	}
	return &Store{db: db, path: path}, nil
}

// Close releases the database handle.
func (s *Store) Close() error { return s.db.Close() }

// DBPath returns the absolute path to the SQLite database file.
func (s *Store) DBPath() string { return s.path }

// Chat models a row in wa_chats.
type Chat struct {
	JID           string `json:"jid"`
	PushName      string `json:"push_name,omitempty"`
	DisplayName   string `json:"display_name,omitempty"`
	AvatarURL     string `json:"avatar_url,omitempty"`
	AvatarID      string `json:"avatar_id,omitempty"`
	LastMessageTS int64  `json:"last_message_ts"`
	LastPreview   string `json:"last_preview,omitempty"`
	LastDirection string `json:"last_direction,omitempty"`
	Paused        bool   `json:"paused"`
	UnreadCount   int    `json:"unread_count"`
	UpdatedAt     int64  `json:"updated_at"`
}

// Message models a row in wa_messages.
type Message struct {
	ID           int64  `json:"id"`
	MessageID    string `json:"message_id,omitempty"`
	ChatJID      string `json:"chat_jid"`
	SenderJID    string `json:"sender_jid,omitempty"`
	Direction    string `json:"direction"`
	Source       string `json:"source"`
	Content      string `json:"content"`
	TS           int64  `json:"ts"`
	Delivered    bool   `json:"delivered"`
	Error        string `json:"error,omitempty"`
	OperatorID   string `json:"operator_id,omitempty"`
	OperatorName string `json:"operator_name,omitempty"`
}

// ContactProfile is the CRM-light row attached to one WhatsApp chat.
type ContactProfile struct {
	ChatJID        string   `json:"chat_jid"`
	Phone          string   `json:"phone,omitempty"`
	PushName       string   `json:"push_name,omitempty"`
	DisplayName    string   `json:"display_name,omitempty"`
	Name           string   `json:"name,omitempty"`
	City           string   `json:"city,omitempty"`
	Company        string   `json:"company,omitempty"`
	Interest       string   `json:"interest,omitempty"`
	Preferences    string   `json:"preferences,omitempty"`
	Summary        string   `json:"summary,omitempty"`
	LeadStage      string   `json:"lead_stage"`
	LeadScore      int      `json:"lead_score"`
	Priority       string   `json:"priority"`
	Intent         string   `json:"intent,omitempty"`
	ConsentStatus  string   `json:"consent_status"`
	Tags           []string `json:"tags"`
	AssignedTo     string   `json:"assigned_to,omitempty"`
	NextAction     string   `json:"next_action,omitempty"`
	FollowUpAt     int64    `json:"follow_up_at,omitempty"`
	FollowUpReason string   `json:"follow_up_reason,omitempty"`
	CreatedAt      int64    `json:"created_at"`
	UpdatedAt      int64    `json:"updated_at"`
}

// ConversationInsight stores the latest structured extraction for a chat.
type ConversationInsight struct {
	ChatJID         string            `json:"chat_jid"`
	Intent          string            `json:"intent,omitempty"`
	Priority        string            `json:"priority"`
	LeadStage       string            `json:"lead_stage"`
	NeedsHandoff    bool              `json:"needs_handoff"`
	Unanswered      bool              `json:"unanswered"`
	TargetSector    string            `json:"target_sector,omitempty"`
	Summary         string            `json:"summary,omitempty"`
	NextAction      string            `json:"next_action,omitempty"`
	CollectedFields map[string]string `json:"collected_fields"`
	MissingFields   []string          `json:"missing_fields"`
	Products        []ProductMention  `json:"products"`
	LastMessageTS   int64             `json:"last_message_ts"`
	UpdatedAt       int64             `json:"updated_at"`
}

// ProductMention is a normalized product/entity mention extracted from text.
type ProductMention struct {
	Product   string `json:"product"`
	Quantity  string `json:"quantity,omitempty"`
	PriceText string `json:"price_text,omitempty"`
	Objection string `json:"objection,omitempty"`
	TS        int64  `json:"ts,omitempty"`
}

type Report struct {
	From                    int64         `json:"from"`
	To                      int64         `json:"to"`
	Contacts                int           `json:"contacts"`
	NewContacts             int           `json:"new_contacts"`
	Messages                int           `json:"messages"`
	InboundMessages         int           `json:"inbound_messages"`
	OutboundMessages        int           `json:"outbound_messages"`
	AgentReplies            int           `json:"agent_replies"`
	HumanReplies            int           `json:"human_replies"`
	PausedChats             int           `json:"paused_chats"`
	QualifiedLeads          int           `json:"qualified_leads"`
	Handoffs                int           `json:"handoffs"`
	Unanswered              int           `json:"unanswered"`
	AvgFirstResponseSeconds int           `json:"avg_first_response_seconds"`
	ByIntent                []LabelCount  `json:"by_intent"`
	ByPriority              []LabelCount  `json:"by_priority"`
	ByLeadStage             []LabelCount  `json:"by_lead_stage"`
	TopProducts             []LabelCount  `json:"top_products"`
	Daily                   []DailyMetric `json:"daily"`
}

type LabelCount struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type DailyMetric struct {
	Date     string `json:"date"`
	Inbound  int    `json:"inbound"`
	Outbound int    `json:"outbound"`
	Contacts int    `json:"contacts"`
}

type messageExtraction struct {
	Intent          string
	Priority        string
	LeadStage       string
	LeadScore       int
	NeedsHandoff    bool
	Unanswered      bool
	TargetSector    string
	Summary         string
	NextAction      string
	Name            string
	City            string
	Company         string
	Interest        string
	Preferences     string
	ConsentStatus   string
	Tags            []string
	CollectedFields map[string]string
	MissingFields   []string
	Products        []ProductMention
}

// RecordMessage persists a message and updates the parent chat row in a
// single transaction. The caller pre-populates Direction/Source.
// Inbound messages also bump unread_count.
func (s *Store) RecordMessage(ctx context.Context, msg Message, pushName string) error {
	if msg.ChatJID == "" {
		return errors.New("inbox: chat_jid is required")
	}
	if msg.Direction != DirectionIn && msg.Direction != DirectionOut {
		return fmt.Errorf("inbox: invalid direction %q", msg.Direction)
	}
	if msg.TS == 0 {
		msg.TS = time.Now().UnixMilli()
	}
	preview := truncate(msg.Content, 160)
	now := time.Now().UnixMilli()

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err = tx.ExecContext(ctx, sqlUpsertChat,
		msg.ChatJID, pushName, pushName, msg.TS, preview, msg.Direction, now,
	); err != nil {
		return fmt.Errorf("upsert chat: %w", err)
	}
	if _, err = tx.ExecContext(ctx, sqlUpsertContactProfileBasic,
		msg.ChatJID, phoneFromJID(msg.ChatJID), pushName, pushName, now, now,
	); err != nil {
		return fmt.Errorf("upsert contact profile: %w", err)
	}

	if _, err = tx.ExecContext(ctx, sqlInsertMessage,
		nullStr(msg.MessageID), msg.ChatJID, nullStr(msg.SenderJID),
		msg.Direction, msg.Source, msg.Content, msg.TS,
		boolToInt(msg.Delivered), nullStr(msg.Error),
		nullStr(msg.OperatorID), nullStr(msg.OperatorName),
	); err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	if msg.Direction == DirectionIn {
		if _, err = tx.ExecContext(ctx, sqlIncrementUnread, msg.ChatJID); err != nil {
			return fmt.Errorf("increment unread: %w", err)
		}
	}
	if err := applyMessageExtraction(ctx, tx, msg, now); err != nil {
		return err
	}

	return tx.Commit()
}

// ListChats returns up to limit chats ordered by recency.
func (s *Store) ListChats(ctx context.Context, limit int) ([]Chat, error) {
	if limit <= 0 || limit > DefaultListLimit {
		limit = DefaultListLimit
	}
	rows, err := s.db.QueryContext(ctx, sqlListChats, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Chat, 0)
	for rows.Next() {
		c, err := scanChat(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetChat returns a single chat by JID. Returns nil, nil when absent.
func (s *Store) GetChat(ctx context.Context, jid string) (*Chat, error) {
	row := s.db.QueryRowContext(ctx, sqlGetChat, jid)
	c, err := scanChat(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// IsPaused reports whether the agent is paused for the given chat.
func (s *Store) IsPaused(ctx context.Context, jid string) (bool, error) {
	var paused int
	err := s.db.QueryRowContext(ctx, sqlIsPaused, jid).Scan(&paused)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return paused != 0, nil
}

// SetPaused toggles the agent pause flag for a chat.
func (s *Store) SetPaused(ctx context.Context, jid string, paused bool) error {
	if jid == "" {
		return errors.New("inbox: jid is required")
	}
	now := time.Now().UnixMilli()
	// Ensure the chat row exists so the toggle persists for first-seen JIDs.
	_, _ = s.db.ExecContext(ctx, sqlUpsertChat, jid, "", "", 0, "", "", now)
	_, err := s.db.ExecContext(ctx, sqlSetPaused, boolToInt(paused), now, jid)
	return err
}

// SetAvatar records the latest avatar URL + id for the chat.
func (s *Store) SetAvatar(ctx context.Context, jid, url, avatarID string) error {
	if jid == "" {
		return errors.New("inbox: jid is required")
	}
	now := time.Now().UnixMilli()
	_, err := s.db.ExecContext(ctx, sqlSetAvatar, nullStr(url), nullStr(avatarID), now, jid)
	return err
}

// MarkRead resets the unread counter for a chat.
func (s *Store) MarkRead(ctx context.Context, jid string) error {
	_, err := s.db.ExecContext(ctx, sqlResetUnread, jid)
	return err
}

// MarkUnread flags a chat as unread on the dashboard (operator action — the
// contact sees no change). Uses MAX(1, unread_count) so a chat that already
// has real unread bumps is not clobbered down to 1.
func (s *Store) MarkUnread(ctx context.Context, jid string) error {
	_, err := s.db.ExecContext(ctx, sqlMarkChatUnread, jid)
	return err
}

// InternalNote is a dashboard-only annotation visible only to operators.
// It is never sent to the contact.
type InternalNote struct {
	ID      int64  `json:"id"`
	ChatJID string `json:"chat_jid"`
	Content string `json:"content"`
	Author  string `json:"author"`
	TS      int64  `json:"ts"`
}

// ListInternalNotes returns the newest internal notes for a chat (capped at
// `limit`, which defaults to DefaultListLimit when <= 0).
func (s *Store) ListInternalNotes(ctx context.Context, jid string, limit int) ([]InternalNote, error) {
	if limit <= 0 || limit > DefaultListLimit {
		limit = DefaultListLimit
	}
	rows, err := s.db.QueryContext(ctx, sqlListInternalNotes, jid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]InternalNote, 0)
	for rows.Next() {
		var n InternalNote
		if err := rows.Scan(&n.ID, &n.ChatJID, &n.Content, &n.Author, &n.TS); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// AddInternalNote persists a new note for a chat and returns it (with the
// generated id). Content is trimmed by the caller — the store enforces
// "non-empty after trim" at the SQL layer by relying on the http handler.
func (s *Store) AddInternalNote(ctx context.Context, n InternalNote) (*InternalNote, error) {
	if n.TS == 0 {
		n.TS = time.Now().UnixMilli()
	}
	res, err := s.db.ExecContext(ctx, sqlInsertInternalNote, n.ChatJID, n.Content, n.Author, n.TS)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	n.ID = id
	return &n, nil
}

// DeleteInternalNote removes a single note. Returns nil even if no rows were
// affected (idempotent) — the http handler returns 204 either way.
func (s *Store) DeleteInternalNote(ctx context.Context, jid string, id int64) error {
	_, err := s.db.ExecContext(ctx, sqlDeleteInternalNote, id, jid)
	return err
}

// ListMessages returns the most recent messages for a chat (newest first).
func (s *Store) ListMessages(ctx context.Context, jid string, limit int) ([]Message, error) {
	if limit <= 0 || limit > DefaultListLimit {
		limit = DefaultListLimit
	}
	rows, err := s.db.QueryContext(ctx, sqlListMessages, jid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Message, 0)
	for rows.Next() {
		var (
			m                            Message
			messageID, senderJID, errStr sql.NullString
			delivered                    int
		)
		if err := rows.Scan(&m.ID, &messageID, &m.ChatJID, &senderJID, &m.Direction,
			&m.Source, &m.Content, &m.TS, &delivered, &errStr,
			&m.OperatorID, &m.OperatorName); err != nil {
			return nil, err
		}
		m.MessageID = messageID.String
		m.SenderJID = senderJID.String
		m.Error = errStr.String
		m.Delivered = delivered != 0
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetContactProfile returns the CRM-light profile for a chat.
func (s *Store) GetContactProfile(ctx context.Context, jid string) (*ContactProfile, error) {
	row := s.db.QueryRowContext(ctx, sqlGetContactProfile, jid)
	profile, err := scanContactProfile(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

// SaveContactProfile upserts a manually curated contact profile.
func (s *Store) SaveContactProfile(ctx context.Context, profile ContactProfile) (*ContactProfile, error) {
	if strings.TrimSpace(profile.ChatJID) == "" {
		return nil, errors.New("inbox: chat_jid is required")
	}
	now := time.Now().UnixMilli()
	existing, err := s.GetContactProfile(ctx, profile.ChatJID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if profile.Phone == "" {
			profile.Phone = existing.Phone
		}
		if profile.PushName == "" {
			profile.PushName = existing.PushName
		}
		if profile.DisplayName == "" {
			profile.DisplayName = existing.DisplayName
		}
		profile.CreatedAt = existing.CreatedAt
	}
	if profile.CreatedAt == 0 {
		profile.CreatedAt = now
	}
	profile.UpdatedAt = now
	profile.LeadStage = defaultString(profile.LeadStage, "novo")
	profile.Priority = defaultString(profile.Priority, "low")
	profile.ConsentStatus = defaultString(profile.ConsentStatus, "unknown")
	tagsJSON := jsonString(profile.Tags, "[]")
	if _, err := s.db.ExecContext(ctx, sqlUpsertContactProfileManual,
		profile.ChatJID, nullStr(profile.Phone), nullStr(profile.PushName),
		nullStr(profile.DisplayName), nullStr(profile.Name), nullStr(profile.City),
		nullStr(profile.Company), nullStr(profile.Interest), nullStr(profile.Preferences),
		nullStr(profile.Summary), profile.LeadStage, profile.LeadScore, profile.Priority,
		nullStr(profile.Intent), profile.ConsentStatus, tagsJSON, nullStr(profile.AssignedTo),
		nullStr(profile.NextAction), profile.FollowUpAt, nullStr(profile.FollowUpReason),
		profile.CreatedAt, profile.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return s.GetContactProfile(ctx, profile.ChatJID)
}

// GetConversationInsight returns the latest structured extraction for a chat.
func (s *Store) GetConversationInsight(ctx context.Context, jid string) (*ConversationInsight, error) {
	row := s.db.QueryRowContext(ctx, sqlGetConversationInsight, jid)
	insight, err := scanConversationInsight(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &insight, nil
}

// BuildReport aggregates WhatsApp operational metrics for a time window.
func (s *Store) BuildReport(ctx context.Context, from, to int64) (Report, error) {
	if to == 0 {
		to = time.Now().UnixMilli()
	}
	if from == 0 {
		from = to - int64(7*24*time.Hour/time.Millisecond)
	}
	report := Report{From: from, To: to}
	var err error
	if report.Contacts, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_contact_profiles WHERE updated_at BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.NewContacts, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_contact_profiles WHERE created_at BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.Messages, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_messages WHERE ts BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.InboundMessages, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_messages WHERE direction = 'in' AND ts BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.OutboundMessages, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_messages WHERE direction = 'out' AND ts BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.AgentReplies, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_messages WHERE source = 'agent' AND ts BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.HumanReplies, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_messages WHERE source = 'human' AND ts BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.PausedChats, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_chats WHERE paused = 1`); err != nil {
		return report, err
	}
	if report.QualifiedLeads, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_contact_profiles WHERE lead_stage IN ('qualificado', 'proposta', 'negociacao') AND updated_at BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.Handoffs, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_conversation_insights WHERE needs_handoff = 1 AND updated_at BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	if report.Unanswered, err = countQuery(ctx, s.db, `SELECT COUNT(*) FROM wa_conversation_insights WHERE unanswered = 1 AND updated_at BETWEEN ? AND ?`, from, to); err != nil {
		return report, err
	}
	report.AvgFirstResponseSeconds, err = avgFirstResponseSeconds(ctx, s.db, from, to)
	if err != nil {
		return report, err
	}
	if report.ByIntent, err = labelCounts(ctx, s.db, `SELECT COALESCE(NULLIF(intent, ''), 'unknown'), COUNT(*) FROM wa_conversation_insights WHERE updated_at BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, from, to); err != nil {
		return report, err
	}
	if report.ByPriority, err = labelCounts(ctx, s.db, `SELECT COALESCE(NULLIF(priority, ''), 'low'), COUNT(*) FROM wa_conversation_insights WHERE updated_at BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, from, to); err != nil {
		return report, err
	}
	if report.ByLeadStage, err = labelCounts(ctx, s.db, `SELECT COALESCE(NULLIF(lead_stage, ''), 'novo'), COUNT(*) FROM wa_contact_profiles WHERE updated_at BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, from, to); err != nil {
		return report, err
	}
	if report.TopProducts, err = labelCounts(ctx, s.db, `SELECT product, COUNT(*) FROM wa_product_mentions WHERE ts BETWEEN ? AND ? GROUP BY product ORDER BY 2 DESC LIMIT 10`, from, to); err != nil {
		return report, err
	}
	if report.Daily, err = dailyMetrics(ctx, s.db, from, to); err != nil {
		return report, err
	}
	return report, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanChat(r rowScanner) (Chat, error) {
	var (
		c                                                                Chat
		pushName, displayName, avatarURL, avatarID, lastPreview, lastDir sql.NullString
		paused                                                           int
	)
	err := r.Scan(&c.JID, &pushName, &displayName, &avatarURL, &avatarID,
		&c.LastMessageTS, &lastPreview, &lastDir, &paused, &c.UnreadCount, &c.UpdatedAt)
	if err != nil {
		return Chat{}, err
	}
	c.PushName = pushName.String
	c.DisplayName = displayName.String
	c.AvatarURL = avatarURL.String
	c.AvatarID = avatarID.String
	c.LastPreview = lastPreview.String
	c.LastDirection = lastDir.String
	c.Paused = paused != 0
	return c, nil
}

func scanContactProfile(r rowScanner) (ContactProfile, error) {
	var (
		p                                                           ContactProfile
		phone, pushName, displayName, name, city, company, interest sql.NullString
		preferences, summary, priority, intent, consent, tagsJSON   sql.NullString
		assignedTo, nextAction, followUpReason                      sql.NullString
		leadStage                                                   sql.NullString
	)
	err := r.Scan(&p.ChatJID, &phone, &pushName, &displayName, &name, &city,
		&company, &interest, &preferences, &summary, &leadStage, &p.LeadScore,
		&priority, &intent, &consent, &tagsJSON, &assignedTo, &nextAction,
		&p.FollowUpAt, &followUpReason, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return ContactProfile{}, err
	}
	p.Phone = phone.String
	p.PushName = pushName.String
	p.DisplayName = displayName.String
	p.Name = name.String
	p.City = city.String
	p.Company = company.String
	p.Interest = interest.String
	p.Preferences = preferences.String
	p.Summary = summary.String
	p.LeadStage = defaultString(leadStage.String, "novo")
	p.Priority = defaultString(priority.String, "low")
	p.Intent = intent.String
	p.ConsentStatus = defaultString(consent.String, "unknown")
	p.AssignedTo = assignedTo.String
	p.NextAction = nextAction.String
	p.FollowUpReason = followUpReason.String
	p.Tags = decodeStringSlice(tagsJSON.String)
	return p, nil
}

func scanConversationInsight(r rowScanner) (ConversationInsight, error) {
	var (
		i                                         ConversationInsight
		intent, targetSector, summary, nextAction sql.NullString
		collectedJSON, missingJSON, productsJSON  sql.NullString
		needsHandoff, unanswered                  int
	)
	err := r.Scan(&i.ChatJID, &intent, &i.Priority, &i.LeadStage, &needsHandoff,
		&unanswered, &targetSector, &summary, &nextAction, &collectedJSON,
		&missingJSON, &productsJSON, &i.LastMessageTS, &i.UpdatedAt)
	if err != nil {
		return ConversationInsight{}, err
	}
	i.Intent = intent.String
	i.Priority = defaultString(i.Priority, "low")
	i.LeadStage = defaultString(i.LeadStage, "novo")
	i.NeedsHandoff = needsHandoff != 0
	i.Unanswered = unanswered != 0
	i.TargetSector = targetSector.String
	i.Summary = summary.String
	i.NextAction = nextAction.String
	i.CollectedFields = decodeStringMap(collectedJSON.String)
	i.MissingFields = decodeStringSlice(missingJSON.String)
	i.Products = decodeProductMentions(productsJSON.String)
	return i, nil
}

func applyMessageExtraction(ctx context.Context, tx *sql.Tx, msg Message, now int64) error {
	ex := analyzeMessage(msg)
	collectedJSON := jsonString(ex.CollectedFields, "{}")
	missingJSON := jsonString(ex.MissingFields, "[]")
	productsJSON := jsonString(ex.Products, "[]")

	if msg.Direction == DirectionIn {
		tagsJSON := jsonString(ex.Tags, "[]")
		if _, err := tx.ExecContext(ctx, sqlApplyContactProfileExtraction,
			ex.Name, ex.City, ex.Company, ex.Interest, ex.Preferences, ex.Summary,
			ex.LeadStage, ex.LeadStage, ex.LeadScore,
			ex.Priority, ex.Priority, ex.Priority, ex.Priority,
			ex.Intent, ex.ConsentStatus, ex.ConsentStatus, tagsJSON, tagsJSON,
			ex.NextAction, now, msg.ChatJID,
		); err != nil {
			return fmt.Errorf("apply contact extraction: %w", err)
		}
		for _, product := range ex.Products {
			if _, err := tx.ExecContext(ctx, sqlInsertProductMention,
				msg.ChatJID, product.Product, nullStr(product.Quantity),
				nullStr(product.PriceText), nullStr(product.Objection), msg.TS, now,
			); err != nil {
				return fmt.Errorf("insert product mention: %w", err)
			}
		}
	}
	if _, err := tx.ExecContext(ctx, sqlUpsertConversationInsight,
		msg.ChatJID, ex.Intent, ex.Priority, ex.LeadStage, boolToInt(ex.NeedsHandoff),
		boolToInt(ex.Unanswered), nullStr(ex.TargetSector), nullStr(ex.Summary),
		nullStr(ex.NextAction), collectedJSON, missingJSON, productsJSON,
		msg.TS, now,
	); err != nil {
		return fmt.Errorf("upsert conversation insight: %w", err)
	}
	return nil
}

func analyzeMessage(msg Message) messageExtraction {
	ex := messageExtraction{
		Priority:        "low",
		LeadStage:       "novo",
		CollectedFields: map[string]string{},
		MissingFields:   []string{},
		Products:        []ProductMention{},
		Tags:            []string{},
	}
	if msg.Direction == DirectionOut {
		ex.Priority = ""
		ex.LeadStage = ""
		ex.Unanswered = false
		ex.Summary = "Atendimento respondeu ao contato."
		return ex
	}
	body := strings.TrimSpace(msg.Content)
	norm := normalizeText(body)
	ex.Unanswered = true
	ex.Intent = detectIntent(norm)
	ex.Priority = detectPriority(norm, ex.Intent)
	ex.NeedsHandoff = shouldHandoff(norm, ex.Priority)
	ex.TargetSector = targetSectorForIntent(ex.Intent)
	ex.LeadStage, ex.LeadScore = detectLeadStage(norm, ex.Intent)
	ex.ConsentStatus = detectConsentStatus(norm)
	ex.Products = detectProducts(norm, msg.TS)
	ex.Tags = tagsForExtraction(ex, norm)
	ex.NextAction = nextActionForExtraction(ex)
	ex.Summary = truncate(body, 220)
	ex.Name = detectName(body)
	ex.City = detectCity(body)
	ex.Company = detectCompany(body)
	ex.Interest = detectInterest(body, ex)
	ex.Preferences = detectPreferences(body)
	if ex.Name != "" {
		ex.CollectedFields["nome"] = ex.Name
	}
	if ex.City != "" {
		ex.CollectedFields["cidade"] = ex.City
	}
	if ex.Company != "" {
		ex.CollectedFields["empresa"] = ex.Company
	}
	if ex.Interest != "" {
		ex.CollectedFields["interesse"] = ex.Interest
	}
	ex.MissingFields = missingFieldsForIntent(ex.Intent, ex.CollectedFields)
	return ex
}

func countQuery(ctx context.Context, db *sql.DB, q string, args ...any) (int, error) {
	var count int
	if err := db.QueryRowContext(ctx, q, args...).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func labelCounts(ctx context.Context, db *sql.DB, q string, args ...any) ([]LabelCount, error) {
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LabelCount{}
	for rows.Next() {
		var item LabelCount
		if err := rows.Scan(&item.Label, &item.Count); err != nil {
			return nil, err
		}
		if item.Label == "" {
			item.Label = "unknown"
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func dailyMetrics(ctx context.Context, db *sql.DB, from, to int64) ([]DailyMetric, error) {
	rows, err := db.QueryContext(ctx, `
SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS day,
       SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END),
       SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END)
FROM wa_messages
WHERE ts BETWEEN ? AND ?
GROUP BY day
ORDER BY day;`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	metrics := map[string]DailyMetric{}
	order := []string{}
	for rows.Next() {
		var m DailyMetric
		if err := rows.Scan(&m.Date, &m.Inbound, &m.Outbound); err != nil {
			return nil, err
		}
		metrics[m.Date] = m
		order = append(order, m.Date)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	contactRows, err := db.QueryContext(ctx, `
SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS day,
       COUNT(*)
FROM wa_contact_profiles
WHERE created_at BETWEEN ? AND ?
GROUP BY day;`, from, to)
	if err != nil {
		return nil, err
	}
	defer contactRows.Close()
	for contactRows.Next() {
		var day string
		var contacts int
		if err := contactRows.Scan(&day, &contacts); err != nil {
			return nil, err
		}
		m := metrics[day]
		if m.Date == "" {
			m.Date = day
			order = append(order, day)
		}
		m.Contacts = contacts
		metrics[day] = m
	}
	if err := contactRows.Err(); err != nil {
		return nil, err
	}
	out := make([]DailyMetric, 0, len(order))
	seen := map[string]struct{}{}
	for _, day := range order {
		if _, ok := seen[day]; ok {
			continue
		}
		seen[day] = struct{}{}
		out = append(out, metrics[day])
	}
	return out, nil
}

func avgFirstResponseSeconds(ctx context.Context, db *sql.DB, from, to int64) (int, error) {
	var avg sql.NullFloat64
	err := db.QueryRowContext(ctx, `
SELECT AVG(first_out - first_in) / 1000.0
FROM (
	SELECT i.chat_jid, i.first_in, MIN(o.ts) AS first_out
	FROM (
		SELECT chat_jid, MIN(ts) AS first_in
		FROM wa_messages
		WHERE direction = 'in' AND ts BETWEEN ? AND ?
		GROUP BY chat_jid
	) i
	JOIN wa_messages o
	  ON o.chat_jid = i.chat_jid
	 AND o.direction = 'out'
	 AND o.ts >= i.first_in
	GROUP BY i.chat_jid, i.first_in
);`, from, to).Scan(&avg)
	if err != nil {
		return 0, err
	}
	if !avg.Valid {
		return 0, nil
	}
	return int(avg.Float64 + 0.5), nil
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func defaultString(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func jsonString(v any, fallback string) string {
	data, err := json.Marshal(v)
	if err != nil || len(data) == 0 {
		return fallback
	}
	return string(data)
}

func decodeStringSlice(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	return out
}

func decodeStringMap(raw string) map[string]string {
	if strings.TrimSpace(raw) == "" {
		return map[string]string{}
	}
	var out map[string]string
	if err := json.Unmarshal([]byte(raw), &out); err != nil || out == nil {
		return map[string]string{}
	}
	return out
}

func decodeProductMentions(raw string) []ProductMention {
	if strings.TrimSpace(raw) == "" {
		return []ProductMention{}
	}
	var out []ProductMention
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []ProductMention{}
	}
	return out
}

func phoneFromJID(jid string) string {
	user, _, _ := strings.Cut(jid, "@")
	if user == "" {
		return ""
	}
	for _, r := range user {
		if r < '0' || r > '9' {
			return ""
		}
	}
	return user
}

func normalizeText(s string) string {
	lower := strings.ToLower(s)
	replacer := strings.NewReplacer(
		"á", "a", "à", "a", "ã", "a", "â", "a",
		"é", "e", "ê", "e",
		"í", "i",
		"ó", "o", "ô", "o", "õ", "o",
		"ú", "u",
		"ç", "c",
	)
	return replacer.Replace(lower)
}

func detectIntent(norm string) string {
	switch {
	case containsAny(norm, "urgente", "emergencia", "processo", "advogado", "procon", "fraude", "vazamento"):
		return "urgencia"
	case containsAny(norm, "preco", "valor", "orcamento", "cotacao", "quanto fica", "quanto custa", "comprar", "pedido"):
		return "orcamento"
	case containsAny(norm, "reclama", "problema", "defeito", "atras", "nao chegou", "quebrado", "errado"):
		return "reclamacao"
	case containsAny(norm, "boleto", "pix", "pagamento", "cobranca", "nota fiscal", "segunda via"):
		return "financeiro"
	case containsAny(norm, "suporte", "erro", "falha", "nao funciona", "instalar"):
		return "suporte"
	case containsAny(norm, "parceria", "fornecedor", "representante", "revenda"):
		return "parceria"
	case containsAny(norm, "agendar", "marcar", "remarcar", "cancelar horario"):
		return "agendamento"
	case containsAny(norm, "horario", "endereco", "localizacao", "funciona", "aberto"):
		return "duvida_geral"
	default:
		return "duvida_geral"
	}
}

func detectPriority(norm, intent string) string {
	if intent == "urgencia" || containsAny(norm, "urgente", "processo", "procon", "fraude", "vazamento", "golpe", "ameaca") {
		return "high"
	}
	if intent == "reclamacao" || containsAny(norm, "hoje", "agora", "rapido", "atrasado", "cancelar") {
		return "medium"
	}
	return "low"
}

func detectLeadStage(norm, intent string) (string, int) {
	if intent != "orcamento" && len(detectProducts(norm, 0)) == 0 {
		return "novo", 0
	}
	if containsAny(norm, "fechar", "comprar", "manda", "entrega hoje", "preciso de", "vou querer") {
		return "qualificado", 80
	}
	if containsAny(norm, "preco", "valor", "orcamento", "quanto custa") {
		return "interessado", 45
	}
	return "novo", 20
}

func detectConsentStatus(norm string) string {
	switch {
	case containsAny(norm, "apagar meus dados", "excluir meus dados", "remover meus dados", "lgpd"):
		return "deletion_requested"
	case containsAny(norm, "autorizo", "pode usar meus dados", "consinto"):
		return "consented"
	default:
		return ""
	}
}

func shouldHandoff(norm, priority string) bool {
	return priority == "high" || containsAny(norm, "falar com atendente", "falar com humano", "vendedor", "gerente", "responsavel")
}

func targetSectorForIntent(intent string) string {
	switch intent {
	case "orcamento":
		return "comercial"
	case "financeiro":
		return "financeiro"
	case "reclamacao":
		return "atendimento"
	case "suporte":
		return "suporte"
	case "parceria":
		return "parcerias"
	case "urgencia":
		return "gestao"
	default:
		return ""
	}
}

func nextActionForExtraction(ex messageExtraction) string {
	if ex.NeedsHandoff {
		return "Encaminhar para " + defaultString(ex.TargetSector, "equipe responsável") + " com resumo do contexto."
	}
	if len(ex.MissingFields) > 0 {
		return "Coletar campos faltantes antes de concluir."
	}
	if ex.Intent == "orcamento" {
		return "Responder orçamento ou confirmar disponibilidade."
	}
	return "Responder com base na informação oficial disponível."
}

func tagsForExtraction(ex messageExtraction, norm string) []string {
	tags := []string{}
	if ex.Intent != "" {
		tags = append(tags, ex.Intent)
	}
	if ex.Priority != "" && ex.Priority != "low" {
		tags = append(tags, "prioridade-"+ex.Priority)
	}
	if ex.LeadStage == "qualificado" {
		tags = append(tags, "lead-qualificado")
	}
	if ex.ConsentStatus != "" {
		tags = append(tags, "lgpd")
	}
	if containsAny(norm, "entrega", "frete") {
		tags = append(tags, "entrega")
	}
	return tags
}

func missingFieldsForIntent(intent string, collected map[string]string) []string {
	required := map[string][]string{
		"orcamento":  {"nome", "interesse"},
		"reclamacao": {"nome"},
		"financeiro": {"nome"},
	}
	fields := required[intent]
	if len(fields) == 0 {
		return []string{}
	}
	missing := []string{}
	for _, field := range fields {
		if strings.TrimSpace(collected[field]) == "" {
			missing = append(missing, field)
		}
	}
	return missing
}

func detectProducts(norm string, ts int64) []ProductMention {
	catalog := []string{
		"cimento", "tinta", "selador", "caixa d'agua", "caixa dagua",
		"bomba d'agua", "bomba dagua", "maquita", "argamassa", "areia",
		"brita", "tijolo", "bloco", "telha", "cano", "piso", "revestimento",
	}
	out := []ProductMention{}
	seen := map[string]struct{}{}
	for _, product := range catalog {
		if !strings.Contains(norm, product) {
			continue
		}
		label := product
		switch product {
		case "caixa dagua":
			label = "caixa d'agua"
		case "bomba dagua":
			label = "bomba d'agua"
		}
		if _, ok := seen[label]; ok {
			continue
		}
		seen[label] = struct{}{}
		out = append(out, ProductMention{
			Product:   label,
			Quantity:  firstMatch(norm, `\b(\d+\s*(?:un|unidade|unidades|sacos?|metros?|m2|m²|litros?|lts?))\b`),
			PriceText: firstMatch(norm, `(?:r\$\s*)?(\d+[,.]\d{2})`),
			Objection: objectionFromText(norm),
			TS:        ts,
		})
	}
	return out
}

func objectionFromText(norm string) string {
	switch {
	case containsAny(norm, "caro", "mais barato", "desconto"):
		return "preco"
	case containsAny(norm, "demora", "prazo", "entrega"):
		return "prazo"
	default:
		return ""
	}
}

func detectName(body string) string {
	return cleanExtractedText(firstMatch(body, `(?i)\b(?:meu nome é|meu nome e|me chamo|sou)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2})`))
}

func detectCity(body string) string {
	return cleanExtractedText(firstMatch(body, `(?i)\b(?:sou de|moro em|cidade de)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})`))
}

func detectCompany(body string) string {
	return cleanExtractedText(firstMatch(body, `(?i)\b(?:empresa|loja|construtora)\s+([A-Za-zÀ-ÿ0-9&.-]+(?:\s+[A-Za-zÀ-ÿ0-9&.-]+){0,4})`))
}

func detectInterest(body string, ex messageExtraction) string {
	if len(ex.Products) > 0 {
		names := make([]string, 0, len(ex.Products))
		for _, p := range ex.Products {
			names = append(names, p.Product)
		}
		return strings.Join(names, ", ")
	}
	if ex.Intent == "orcamento" {
		return truncate(body, 120)
	}
	return ""
}

func detectPreferences(body string) string {
	norm := normalizeText(body)
	prefs := []string{}
	if containsAny(norm, "entrega") {
		prefs = append(prefs, "entrega")
	}
	if containsAny(norm, "retirar", "retirada") {
		prefs = append(prefs, "retirada")
	}
	if containsAny(norm, "pix") {
		prefs = append(prefs, "pix")
	}
	return strings.Join(prefs, ", ")
}

func containsAny(s string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(s, needle) {
			return true
		}
	}
	return false
}

func firstMatch(s, pattern string) string {
	re := regexp.MustCompile(pattern)
	matches := re.FindStringSubmatch(s)
	if len(matches) < 2 {
		return ""
	}
	return matches[1]
}

func cleanExtractedText(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, ".,;:!?")
	words := strings.Fields(s)
	if len(words) > 4 {
		words = words[:4]
	}
	return strings.Join(words, " ")
}
