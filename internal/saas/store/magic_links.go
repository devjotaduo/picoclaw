package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrMagicLinkNotFound is returned when a lookup misses.
var ErrMagicLinkNotFound = errors.New("magic link not found")

// MagicLink mirrors the magic_links row. consumed_at NULL means active;
// non-NULL means a friendly thank-you page renders on click.
type MagicLink struct {
	Nonce      string
	TenantID   string
	IntakeID   *string
	CreatedAt  time.Time
	ExpiresAt  time.Time
	ConsumedAt *time.Time
	Summary    *string
}

type MagicLinkStore struct {
	DB *DB
}

func (s *MagicLinkStore) Insert(ctx context.Context, m *MagicLink) error {
	const q = `
		INSERT INTO magic_links (nonce, tenant_id, intake_id, expires_at)
		VALUES ($1, $2, $3, $4)
	`
	_, err := s.DB.Pool.Exec(ctx, q, m.Nonce, m.TenantID, m.IntakeID, m.ExpiresAt)
	return err
}

func (s *MagicLinkStore) Get(ctx context.Context, nonce string) (*MagicLink, error) {
	const q = `
		SELECT nonce, tenant_id, intake_id, created_at, expires_at, consumed_at, summary
		FROM magic_links WHERE nonce = $1
	`
	m := &MagicLink{}
	err := s.DB.Pool.QueryRow(ctx, q, nonce).Scan(
		&m.Nonce, &m.TenantID, &m.IntakeID, &m.CreatedAt, &m.ExpiresAt, &m.ConsumedAt, &m.Summary,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMagicLinkNotFound
	}
	return m, err
}

// MarkConsumed sets consumed_at = now() and stores the summary. Idempotent:
// re-marking an already-consumed link refreshes the summary but does NOT
// move consumed_at backward (use COALESCE to keep the first consumption
// timestamp). Returns ErrMagicLinkNotFound if nonce doesn't exist.
func (s *MagicLinkStore) MarkConsumed(ctx context.Context, nonce string, summary string) error {
	const q = `
		UPDATE magic_links
		SET consumed_at = COALESCE(consumed_at, now()),
		    summary = NULLIF($2, '')
		WHERE nonce = $1
	`
	tag, err := s.DB.Pool.Exec(ctx, q, nonce, summary)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMagicLinkNotFound
	}
	return nil
}

// MarkConsumedByIntake marks every active link tied to the given intake as
// consumed, with the same summary. Returns the number of rows affected so
// the caller can log how many visitor links got invalidated by the submit.
func (s *MagicLinkStore) MarkConsumedByIntake(ctx context.Context, intakeID, summary string) (int64, error) {
	const q = `
		UPDATE magic_links
		SET consumed_at = COALESCE(consumed_at, now()),
		    summary = NULLIF($2, '')
		WHERE intake_id = $1 AND consumed_at IS NULL
	`
	tag, err := s.DB.Pool.Exec(ctx, q, intakeID, summary)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ListByTenant returns the most recent links for a tenant (newest first).
// Used by the admin UI to list active and consumed links per tenant.
func (s *MagicLinkStore) ListByTenant(ctx context.Context, tenantID string, limit int) ([]*MagicLink, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const q = `
		SELECT nonce, tenant_id, intake_id, created_at, expires_at, consumed_at, summary
		FROM magic_links
		WHERE tenant_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`
	rows, err := s.DB.Pool.Query(ctx, q, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*MagicLink{}
	for rows.Next() {
		m := &MagicLink{}
		if err := rows.Scan(&m.Nonce, &m.TenantID, &m.IntakeID, &m.CreatedAt, &m.ExpiresAt, &m.ConsumedAt, &m.Summary); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
