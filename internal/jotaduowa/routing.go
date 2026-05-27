package jotaduowa

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Routing persists the phone→tenant_id mapping that lets the sidecar deliver
// inbound WhatsApp messages back to the public tenant that's currently
// engaged with that lead's number.
//
// Lifecycle: a tenant's skill registers a phone when Catarina first writes to
// a lead. At promotion (or on demand), the controlplane deletes all rows for
// that tenant so future inbound from those numbers no longer routes anywhere.
//
// The SQLite file lives at <storeDir>/routing.db — separate from whatsmeow's
// store.db so a corrupted routing table can be rebuilt without re-pairing.
type Routing struct {
	db *sql.DB
}

// Route is a single phone→tenant_id mapping with metadata for debugging.
type Route struct {
	Phone        string
	TenantID     string
	RegisteredAt time.Time
}

// OpenRouting opens (and migrates) the routing database under storeDir.
func OpenRouting(storeDir string) (*Routing, error) {
	if storeDir == "" {
		return nil, errors.New("storeDir is required")
	}
	dbPath := filepath.Join(storeDir, "routing.db")
	db, err := sql.Open("sqlite", "file:"+dbPath+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("open routing db: %w", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS wa_routing (
			phone         TEXT PRIMARY KEY,
			tenant_id     TEXT NOT NULL,
			registered_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS wa_routing_tenant_idx ON wa_routing(tenant_id);
	`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrate routing db: %w", err)
	}
	return &Routing{db: db}, nil
}

// Close releases the underlying SQLite handle.
func (r *Routing) Close() error {
	if r == nil || r.db == nil {
		return nil
	}
	return r.db.Close()
}

// Register upserts a phone→tenant mapping. Re-registering an existing phone
// to a different tenant rewrites the row — the latest tenant wins.
func (r *Routing) Register(ctx context.Context, phone, tenantID string) error {
	phone = normalizePhone(phone)
	tenantID = strings.TrimSpace(tenantID)
	if phone == "" {
		return errors.New("phone is required")
	}
	if tenantID == "" {
		return errors.New("tenant_id is required")
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO wa_routing(phone, tenant_id, registered_at)
		VALUES (?, ?, ?)
		ON CONFLICT(phone) DO UPDATE SET
			tenant_id = excluded.tenant_id,
			registered_at = excluded.registered_at
	`, phone, tenantID, time.Now().Unix())
	return err
}

// Lookup returns the tenant_id mapped to a phone, or "" + nil error when not
// found. Strips JID suffixes (@s.whatsapp.net) so callers can pass the raw
// SenderJID without massaging it.
func (r *Routing) Lookup(ctx context.Context, phone string) (string, error) {
	phone = normalizePhone(phone)
	if phone == "" {
		return "", nil
	}
	var tenantID string
	err := r.db.QueryRowContext(ctx,
		`SELECT tenant_id FROM wa_routing WHERE phone = ?`, phone,
	).Scan(&tenantID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return tenantID, nil
}

// ListByTenant returns every phone currently routed to a tenant — used by the
// admin for debugging and by the controlplane to audit pending routes before
// promotion.
func (r *Routing) ListByTenant(ctx context.Context, tenantID string) ([]Route, error) {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return nil, errors.New("tenant_id is required")
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT phone, tenant_id, registered_at FROM wa_routing WHERE tenant_id = ? ORDER BY registered_at DESC`,
		tenantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Route
	for rows.Next() {
		var r Route
		var ts int64
		if err := rows.Scan(&r.Phone, &r.TenantID, &ts); err != nil {
			return nil, err
		}
		r.RegisteredAt = time.Unix(ts, 0)
		out = append(out, r)
	}
	return out, rows.Err()
}

// RevokeByTenant deletes every phone routed to the given tenant. Returns the
// number of rows removed. Idempotent: deleting a tenant with no routes is a
// no-op that returns (0, nil).
func (r *Routing) RevokeByTenant(ctx context.Context, tenantID string) (int64, error) {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return 0, errors.New("tenant_id is required")
	}
	res, err := r.db.ExecContext(ctx, `DELETE FROM wa_routing WHERE tenant_id = ?`, tenantID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// normalizePhone strips a WhatsApp JID suffix and any whitespace/+ prefix
// so lookups by either raw phone ("5511...") or full JID ("5511...@s.whatsapp.net")
// hit the same row.
func normalizePhone(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '@'); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimPrefix(s, "+")
	return s
}
