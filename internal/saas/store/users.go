package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrSessionNotFound    = errors.New("session not found")
	ErrMembershipNotFound = errors.New("tenant membership not found")
)

type PlatformRole string

const (
	PlatformRoleNone  PlatformRole = ""
	RolePlatformAdmin PlatformRole = "platform_admin"
)

type TenantRole string

const (
	RoleTenantOwner TenantRole = "tenant_owner"
	RoleTenantAdmin TenantRole = "tenant_admin"
	RoleOperator    TenantRole = "operator"
	RoleViewer      TenantRole = "viewer"
)

type UserStatus string

const (
	UserStatusActive   UserStatus = "active"
	UserStatusInvited  UserStatus = "invited"
	UserStatusDisabled UserStatus = "disabled"
)

type User struct {
	ID           int64        `json:"id"`
	Email        string       `json:"email"`
	BcryptHash   *string      `json:"-"`
	Status       UserStatus   `json:"status"`
	PlatformRole PlatformRole `json:"platform_role"`
	CreatedAt    time.Time    `json:"created_at"`
	LastLogin    *time.Time   `json:"last_login"`
}

func (u *User) IsPlatformAdmin() bool {
	return u != nil && u.PlatformRole == RolePlatformAdmin && u.Status == UserStatusActive
}

type UserStore struct{ DB *DB }

func NormalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}

func (s *UserStore) CreatePlatformAdmin(ctx context.Context, email, bcryptHash string) (*User, error) {
	const q = `
		INSERT INTO users (email, bcrypt_hash, status, platform_role)
		VALUES ($1, $2, 'active', 'platform_admin')
		ON CONFLICT (email) DO UPDATE
		SET bcrypt_hash = COALESCE(users.bcrypt_hash, excluded.bcrypt_hash),
		    status = 'active',
		    platform_role = 'platform_admin'
		RETURNING id, email, bcrypt_hash, status, platform_role, created_at, last_login`
	return scanUser(s.DB.Pool.QueryRow(ctx, q, NormalizeEmail(email), bcryptHash))
}

func (s *UserStore) ResetPlatformAdminPassword(ctx context.Context, email, bcryptHash string) (*User, error) {
	const q = `
		INSERT INTO users (email, bcrypt_hash, status, platform_role)
		VALUES ($1, $2, 'active', 'platform_admin')
		ON CONFLICT (email) DO UPDATE
		SET bcrypt_hash = excluded.bcrypt_hash,
		    status = 'active',
		    platform_role = 'platform_admin'
		RETURNING id, email, bcrypt_hash, status, platform_role, created_at, last_login`
	return scanUser(s.DB.Pool.QueryRow(ctx, q, NormalizeEmail(email), bcryptHash))
}

func (s *UserStore) EnsureInvited(ctx context.Context, email string) (*User, error) {
	const q = `
		INSERT INTO users (email, status)
		VALUES ($1, 'invited')
		ON CONFLICT (email) DO UPDATE
		SET email = excluded.email
		RETURNING id, email, bcrypt_hash, status, platform_role, created_at, last_login`
	return scanUser(s.DB.Pool.QueryRow(ctx, q, NormalizeEmail(email)))
}

func (s *UserStore) Activate(ctx context.Context, email, bcryptHash string) (*User, error) {
	const q = `
		INSERT INTO users (email, bcrypt_hash, status)
		VALUES ($1, $2, 'active')
		ON CONFLICT (email) DO UPDATE
		SET bcrypt_hash = excluded.bcrypt_hash,
		    status = 'active'
		RETURNING id, email, bcrypt_hash, status, platform_role, created_at, last_login`
	return scanUser(s.DB.Pool.QueryRow(ctx, q, NormalizeEmail(email), bcryptHash))
}

func (s *UserStore) GetByEmail(ctx context.Context, email string) (*User, error) {
	const q = `
		SELECT id, email, bcrypt_hash, status, platform_role, created_at, last_login
		FROM users
		WHERE email = $1`
	u, err := scanUser(s.DB.Pool.QueryRow(ctx, q, NormalizeEmail(email)))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	return u, err
}

func (s *UserStore) GetByID(ctx context.Context, id int64) (*User, error) {
	const q = `
		SELECT id, email, bcrypt_hash, status, platform_role, created_at, last_login
		FROM users
		WHERE id = $1`
	u, err := scanUser(s.DB.Pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	return u, err
}

func (s *UserStore) MarkLogin(ctx context.Context, id int64) error {
	_, err := s.DB.Pool.Exec(ctx, `UPDATE users SET last_login = now() WHERE id = $1`, id)
	return err
}

// UpdatePassword replaces the bcrypt hash for an existing active user.
// Returns ErrUserNotFound when the user row is missing or not active.
func (s *UserStore) UpdatePassword(ctx context.Context, id int64, bcryptHash string) error {
	const q = `
		UPDATE users
		SET bcrypt_hash = $2
		WHERE id = $1 AND status = 'active'`
	tag, err := s.DB.Pool.Exec(ctx, q, id, bcryptHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// ListAll returns all users ordered by creation date, for platform admin use.
func (s *UserStore) ListAll(ctx context.Context) ([]*User, error) {
	const q = `
		SELECT id, email, bcrypt_hash, status, platform_role, created_at, last_login
		FROM users
		ORDER BY created_at DESC
		LIMIT 200`
	rows, err := s.DB.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.BcryptHash, &u.Status, &u.PlatformRole, &u.CreatedAt, &u.LastLogin)
	return &u, err
}

type TenantMembership struct {
	UserID    int64      `json:"user_id"`
	TenantID  string     `json:"tenant_id"`
	Role      TenantRole `json:"role"`
	CreatedAt time.Time  `json:"created_at"`
	UserEmail string     `json:"email,omitempty"`
}

type MembershipStore struct{ DB *DB }

func (s *MembershipStore) Upsert(ctx context.Context, userID int64, tenantID string, role TenantRole) error {
	const q = `
		INSERT INTO tenant_memberships (user_id, tenant_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = excluded.role`
	_, err := s.DB.Pool.Exec(ctx, q, userID, tenantID, role)
	return err
}

func (s *MembershipStore) GetRole(ctx context.Context, userID int64, tenantID string) (TenantRole, error) {
	const q = `SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2`
	var role TenantRole
	if err := s.DB.Pool.QueryRow(ctx, q, userID, tenantID).Scan(&role); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrMembershipNotFound
		}
		return "", err
	}
	return role, nil
}

func (s *MembershipStore) ListForTenant(ctx context.Context, tenantID string) ([]TenantMembership, error) {
	const q = `
		SELECT tm.user_id, tm.tenant_id, tm.role, tm.created_at, u.email
		FROM tenant_memberships tm
		JOIN users u ON u.id = tm.user_id
		WHERE tm.tenant_id = $1
		ORDER BY tm.created_at ASC`
	rows, err := s.DB.Pool.Query(ctx, q, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TenantMembership
	for rows.Next() {
		var m TenantMembership
		if err := rows.Scan(&m.UserID, &m.TenantID, &m.Role, &m.CreatedAt, &m.UserEmail); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *MembershipStore) Delete(ctx context.Context, userID int64, tenantID string) error {
	const q = `DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2`
	tag, err := s.DB.Pool.Exec(ctx, q, userID, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMembershipNotFound
	}
	return nil
}

func (s *MembershipStore) ListForUser(ctx context.Context, userID int64) ([]TenantMembership, error) {
	const q = `
		SELECT user_id, tenant_id, role, created_at, '' AS email
		FROM tenant_memberships
		WHERE user_id = $1
		ORDER BY created_at ASC`
	rows, err := s.DB.Pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TenantMembership
	for rows.Next() {
		var m TenantMembership
		if err := rows.Scan(&m.UserID, &m.TenantID, &m.Role, &m.CreatedAt, &m.UserEmail); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

type SessionStore struct{ DB *DB }

func (s *SessionStore) Create(ctx context.Context, userID int64, ttl time.Duration) (string, error) {
	raw, err := randomToken(32)
	if err != nil {
		return "", err
	}
	hash := hashToken(raw)
	const q = `
		INSERT INTO sessions (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)`
	if _, err := s.DB.Pool.Exec(ctx, q, userID, hash, time.Now().Add(ttl)); err != nil {
		return "", err
	}
	return raw, nil
}

func (s *SessionStore) GetUser(ctx context.Context, raw string) (*User, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, ErrSessionNotFound
	}
	const q = `
		UPDATE sessions
		SET last_seen_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
		RETURNING user_id`
	var userID int64
	if err := s.DB.Pool.QueryRow(ctx, q, hashToken(raw)).Scan(&userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return (&UserStore{DB: s.DB}).GetByID(ctx, userID)
}

func (s *SessionStore) Revoke(ctx context.Context, raw string) error {
	_, err := s.DB.Pool.Exec(ctx, `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`, hashToken(raw))
	return err
}

func randomToken(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
