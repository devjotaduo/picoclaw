package store

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
)

// Shortlink is one row of the shortlinks table.
type Shortlink struct {
	Code      string
	TargetURL string
	CreatedAt time.Time
	ExpiresAt time.Time
	CreatedBy *int64
	Label     string
	Hits      int
	LastHitAt *time.Time
}

// ErrShortlinkNotFound is returned by Get when the code doesn't exist or
// has expired (we treat expired as not-found to keep the resolver
// branch-free: one 404 response on either condition).
var ErrShortlinkNotFound = errors.New("shortlink not found")

type ShortlinkStore struct {
	DB *DB
}

const shortlinkCols = `code, target_url, created_at, expires_at, created_by, label, hits, last_hit_at`

// Insert persists a new shortlink. Caller picks the code (via
// GenerateCode below); a duplicate triggers a unique-violation error
// and the caller retries with a fresh code.
func (s *ShortlinkStore) Insert(ctx context.Context, sl *Shortlink) error {
	if sl.ExpiresAt.IsZero() {
		return fmt.Errorf("shortlink: expires_at is required")
	}
	q := `INSERT INTO shortlinks (` + shortlinkCols + `)
	      VALUES ($1, $2, COALESCE($3, now()), $4, $5, $6, $7, $8)`
	var createdAt any
	if !sl.CreatedAt.IsZero() {
		createdAt = sl.CreatedAt
	}
	_, err := s.DB.Pool.Exec(ctx, q,
		sl.Code, sl.TargetURL, createdAt, sl.ExpiresAt,
		sl.CreatedBy, sl.Label, sl.Hits, sl.LastHitAt,
	)
	return err
}

// Get fetches the row by code AND verifies the link hasn't expired. The
// resolver uses this to keep the 404 path simple (no separate "expired"
// status to surface to the visitor).
func (s *ShortlinkStore) Get(ctx context.Context, code string) (*Shortlink, error) {
	q := `SELECT ` + shortlinkCols + ` FROM shortlinks WHERE code = $1 AND expires_at > now()`
	var sl Shortlink
	err := s.DB.Pool.QueryRow(ctx, q, code).Scan(
		&sl.Code, &sl.TargetURL, &sl.CreatedAt, &sl.ExpiresAt,
		&sl.CreatedBy, &sl.Label, &sl.Hits, &sl.LastHitAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrShortlinkNotFound
		}
		return nil, err
	}
	return &sl, nil
}

// RecordHit increments the counter and updates last_hit_at. Best-effort:
// errors are returned for logging but the redirect path shouldn't fail
// just because the counter update lost a race.
func (s *ShortlinkStore) RecordHit(ctx context.Context, code string) error {
	q := `UPDATE shortlinks SET hits = hits + 1, last_hit_at = now() WHERE code = $1`
	_, err := s.DB.Pool.Exec(ctx, q, code)
	return err
}

// List returns recent shortlinks for the admin UI. Newest first, capped.
func (s *ShortlinkStore) List(ctx context.Context, limit int) ([]*Shortlink, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := `SELECT ` + shortlinkCols + ` FROM shortlinks ORDER BY created_at DESC LIMIT $1`
	rows, err := s.DB.Pool.Query(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Shortlink, 0, limit)
	for rows.Next() {
		var sl Shortlink
		if err := rows.Scan(
			&sl.Code, &sl.TargetURL, &sl.CreatedAt, &sl.ExpiresAt,
			&sl.CreatedBy, &sl.Label, &sl.Hits, &sl.LastHitAt,
		); err != nil {
			return nil, err
		}
		out = append(out, &sl)
	}
	return out, rows.Err()
}

// Delete revokes a shortlink. Idempotent: returns nil whether the row
// existed or not (matches the admin UI's "delete" affordance — clicking
// twice shouldn't surface an error).
func (s *ShortlinkStore) Delete(ctx context.Context, code string) error {
	_, err := s.DB.Pool.Exec(ctx, `DELETE FROM shortlinks WHERE code = $1`, code)
	return err
}

// PurgeExpired drops every row past its expiry. Called periodically by
// the cleanup goroutine so the table doesn't grow unbounded.
func (s *ShortlinkStore) PurgeExpired(ctx context.Context) (int64, error) {
	tag, err := s.DB.Pool.Exec(ctx, `DELETE FROM shortlinks WHERE expires_at < now()`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// shortlinkAlphabet excludes 0/O/1/I/l to make codes readable when an
// operator dictates them over the phone (and to dodge a few O-vs-0
// transcription bugs). 56 chars → ~47 bits of entropy for 8-char codes.
const shortlinkAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

// GenerateCode returns a fresh random code of n characters from the
// readability-friendly alphabet. Crypto/rand under the hood — code
// guessability isn't the threat model (URLs are also gated by the
// expires_at), but using crypto/rand avoids predictable sequences and
// is the same cost as math/rand on modern Go.
func GenerateCode(n int) (string, error) {
	if n <= 0 {
		n = 8
	}
	mod := big.NewInt(int64(len(shortlinkAlphabet)))
	buf := make([]byte, n)
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, mod)
		if err != nil {
			return "", err
		}
		buf[i] = shortlinkAlphabet[idx.Int64()]
	}
	return string(buf), nil
}
