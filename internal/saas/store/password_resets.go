package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrPasswordResetNotFound is returned when a token lookup misses OR the
// row exists but is consumed/expired. Callers map this to a generic 401
// in the API so the response shape doesn't leak which condition failed.
var ErrPasswordResetNotFound = errors.New("password reset token not found")

// PasswordReset mirrors the password_resets row. UsedAt non-nil means the
// row has been consumed and is no longer valid.
type PasswordReset struct {
	Token     string
	UserID    int64
	CreatedAt time.Time
	ExpiresAt time.Time
	UsedAt    *time.Time
	IP        *string
	UserAgent *string
}

type PasswordResetStore struct {
	DB *DB
}

// Insert creates a new reset row. The caller generates the token (via
// auth.RandomToken) — storing it as-is is safe because it's
// already-random + indexed + expires quickly; hashing would only matter
// if the database itself was the threat model.
func (s *PasswordResetStore) Insert(ctx context.Context, pr *PasswordReset) error {
	const q = `
		INSERT INTO password_resets (token, user_id, expires_at, ip, user_agent)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := s.DB.Pool.Exec(ctx, q, pr.Token, pr.UserID, pr.ExpiresAt, pr.IP, pr.UserAgent)
	return err
}

// GetUsable returns the row only when it exists, is unconsumed, and is
// not expired. Returns ErrPasswordResetNotFound for every other case so
// the caller can issue a single generic 401 — no leakage of whether the
// token was wrong vs. wrong-but-expired.
func (s *PasswordResetStore) GetUsable(ctx context.Context, token string) (*PasswordReset, error) {
	const q = `
		SELECT token, user_id, created_at, expires_at, used_at, ip, user_agent
		FROM password_resets
		WHERE token = $1
		  AND used_at IS NULL
		  AND expires_at > now()
	`
	pr := &PasswordReset{}
	err := s.DB.Pool.QueryRow(ctx, q, token).Scan(
		&pr.Token, &pr.UserID, &pr.CreatedAt, &pr.ExpiresAt,
		&pr.UsedAt, &pr.IP, &pr.UserAgent,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPasswordResetNotFound
	}
	return pr, err
}

// MarkUsed flips used_at = now(). One-shot guarantee: a token consumed
// once cannot be reused even if the request body is replayed.
// Idempotent: re-marking a used row keeps the original used_at via
// COALESCE so we don't move the timestamp forward.
func (s *PasswordResetStore) MarkUsed(ctx context.Context, token string) error {
	const q = `
		UPDATE password_resets
		SET used_at = COALESCE(used_at, now())
		WHERE token = $1
	`
	tag, err := s.DB.Pool.Exec(ctx, q, token)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPasswordResetNotFound
	}
	return nil
}

// InvalidateAllForUser marks every outstanding reset for the user as
// used. Called after a successful password change so any concurrent
// reset emails the user has lying around become inert immediately.
func (s *PasswordResetStore) InvalidateAllForUser(ctx context.Context, userID int64) error {
	const q = `
		UPDATE password_resets
		SET used_at = COALESCE(used_at, now())
		WHERE user_id = $1 AND used_at IS NULL
	`
	_, err := s.DB.Pool.Exec(ctx, q, userID)
	return err
}
