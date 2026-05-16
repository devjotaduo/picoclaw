package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrInviteNotFound = errors.New("invite not found")

type Invite struct {
	ID         int64      `json:"id"`
	TenantID   string     `json:"tenant_id"`
	Email      string     `json:"email"`
	Role       TenantRole `json:"role"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  time.Time  `json:"expires_at"`
	AcceptedAt *time.Time `json:"accepted_at"`
}

type InviteStore struct{ DB *DB }

func (s *InviteStore) Create(ctx context.Context, tenantID, email string, role TenantRole, invitedBy int64, ttl time.Duration) (*Invite, string, error) {
	token, err := inviteToken()
	if err != nil {
		return nil, "", err
	}
	const q = `
		INSERT INTO invites (tenant_id, email, role, token_hash, invited_by, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, tenant_id, email, role, created_at, expires_at, accepted_at`
	var inv Invite
	err = s.DB.Pool.QueryRow(ctx, q, tenantID, NormalizeEmail(email), role, inviteHash(token), invitedBy, time.Now().Add(ttl)).
		Scan(&inv.ID, &inv.TenantID, &inv.Email, &inv.Role, &inv.CreatedAt, &inv.ExpiresAt, &inv.AcceptedAt)
	if err != nil {
		return nil, "", err
	}
	return &inv, token, nil
}

func (s *InviteStore) GetOpenByToken(ctx context.Context, token string) (*Invite, error) {
	const q = `
		SELECT id, tenant_id, email, role, created_at, expires_at, accepted_at
		FROM invites
		WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()`
	var inv Invite
	err := s.DB.Pool.QueryRow(ctx, q, inviteHash(token)).
		Scan(&inv.ID, &inv.TenantID, &inv.Email, &inv.Role, &inv.CreatedAt, &inv.ExpiresAt, &inv.AcceptedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInviteNotFound
		}
		return nil, err
	}
	return &inv, nil
}

func (s *InviteStore) MarkAccepted(ctx context.Context, id int64) error {
	_, err := s.DB.Pool.Exec(ctx, `UPDATE invites SET accepted_at = now() WHERE id = $1`, id)
	return err
}

// ListForTenant returns all invites for a tenant, most recent first.
func (s *InviteStore) ListForTenant(ctx context.Context, tenantID string) ([]Invite, error) {
	const q = `
		SELECT id, tenant_id, email, role, created_at, expires_at, accepted_at
		FROM invites
		WHERE tenant_id = $1
		ORDER BY created_at DESC`
	rows, err := s.DB.Pool.Query(ctx, q, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Invite
	for rows.Next() {
		var inv Invite
		if err := rows.Scan(&inv.ID, &inv.TenantID, &inv.Email, &inv.Role, &inv.CreatedAt, &inv.ExpiresAt, &inv.AcceptedAt); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

// Delete removes an invite by id + tenant (prevents cross-tenant deletion).
func (s *InviteStore) Delete(ctx context.Context, id int64, tenantID string) error {
	_, err := s.DB.Pool.Exec(ctx, `DELETE FROM invites WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	return err
}

type AuditStore struct{ DB *DB }

func (s *AuditStore) Insert(ctx context.Context, actorID *int64, tenantID *string, action, targetType, targetID string) error {
	const q = `
		INSERT INTO audit_logs (actor_id, tenant_id, action, target_type, target_id)
		VALUES ($1, $2, $3, $4, $5)`
	_, err := s.DB.Pool.Exec(ctx, q, actorID, tenantID, action, targetType, targetID)
	return err
}

func (s *AuditStore) Recent(ctx context.Context, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	const q = `
		SELECT a.id, a.actor_id, u.email, a.tenant_id, a.action, a.target_type, a.target_id, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_id
		ORDER BY a.created_at DESC
		LIMIT $1`
	rows, err := s.DB.Pool.Query(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var (
			id         int64
			actorID    *int64
			actorEmail *string
			tenantID   *string
			action     string
			targetType *string
			targetID   *string
			createdAt  time.Time
		)
		if err := rows.Scan(&id, &actorID, &actorEmail, &tenantID, &action, &targetType, &targetID, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id":          id,
			"actor_id":    actorID,
			"actor_email": actorEmail,
			"tenant_id":   tenantID,
			"action":      action,
			"target_type": targetType,
			"target_id":   targetID,
			"created_at":  createdAt,
		})
	}
	return out, rows.Err()
}

func inviteToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func inviteHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
