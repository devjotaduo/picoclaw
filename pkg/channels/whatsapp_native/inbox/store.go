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
	"errors"
	"fmt"
	"path/filepath"
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
	return &Store{db: db, path: path}, nil
}

// Close releases the database handle.
func (s *Store) Close() error { return s.db.Close() }

// DBPath returns the absolute path to the SQLite database file.
func (s *Store) DBPath() string { return s.path }

// Chat models a row in wa_chats.
type Chat struct {
	JID            string `json:"jid"`
	PushName       string `json:"push_name,omitempty"`
	DisplayName    string `json:"display_name,omitempty"`
	AvatarURL      string `json:"avatar_url,omitempty"`
	AvatarID       string `json:"avatar_id,omitempty"`
	LastMessageTS  int64  `json:"last_message_ts"`
	LastPreview    string `json:"last_preview,omitempty"`
	LastDirection  string `json:"last_direction,omitempty"`
	Paused         bool   `json:"paused"`
	UnreadCount    int    `json:"unread_count"`
	UpdatedAt      int64  `json:"updated_at"`
}

// Message models a row in wa_messages.
type Message struct {
	ID         int64  `json:"id"`
	MessageID  string `json:"message_id,omitempty"`
	ChatJID    string `json:"chat_jid"`
	SenderJID  string `json:"sender_jid,omitempty"`
	Direction  string `json:"direction"`
	Source     string `json:"source"`
	Content    string `json:"content"`
	TS         int64  `json:"ts"`
	Delivered  bool   `json:"delivered"`
	Error      string `json:"error,omitempty"`
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

	if _, err = tx.ExecContext(ctx, sqlInsertMessage,
		nullStr(msg.MessageID), msg.ChatJID, nullStr(msg.SenderJID),
		msg.Direction, msg.Source, msg.Content, msg.TS,
		boolToInt(msg.Delivered), nullStr(msg.Error),
	); err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	if msg.Direction == DirectionIn {
		if _, err = tx.ExecContext(ctx, sqlIncrementUnread, msg.ChatJID); err != nil {
			return fmt.Errorf("increment unread: %w", err)
		}
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
			m                                Message
			messageID, senderJID, errStr     sql.NullString
			delivered                        int
		)
		if err := rows.Scan(&m.ID, &messageID, &m.ChatJID, &senderJID, &m.Direction,
			&m.Source, &m.Content, &m.TS, &delivered, &errStr); err != nil {
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
