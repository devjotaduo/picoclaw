package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sipeed/picoclaw/internal/saas/policy"
)

var ErrLauncherProfileNotFound = errors.New("launcher profile not found")

type LauncherProfile struct {
	ID             string
	Name           string
	Slug           string
	Description    string
	IsDefault      bool
	Version        int64
	SeedPath       string
	RolePolicyJSON []byte
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (p *LauncherProfile) RolePolicy() policy.RolePolicy {
	var rp policy.RolePolicy
	if len(p.RolePolicyJSON) > 0 {
		_ = json.Unmarshal(p.RolePolicyJSON, &rp)
	}
	return policy.NormalizeRolePolicy(rp)
}

func MarshalRolePolicy(rp policy.RolePolicy) ([]byte, error) {
	return json.Marshal(policy.NormalizeRolePolicy(rp))
}

type LauncherProfileStore struct{ DB *DB }

const launcherProfileCols = `id, name, slug, description, is_default, version, seed_path,
    role_policy_json, created_at, updated_at`

func scanLauncherProfile(row pgx.Row) (*LauncherProfile, error) {
	var p LauncherProfile
	err := row.Scan(
		&p.ID, &p.Name, &p.Slug, &p.Description, &p.IsDefault, &p.Version,
		&p.SeedPath, &p.RolePolicyJSON, &p.CreatedAt, &p.UpdatedAt,
	)
	return &p, err
}

func (s *LauncherProfileStore) Insert(ctx context.Context, p *LauncherProfile) error {
	if p.Version <= 0 {
		p.Version = 1
	}
	if p.RolePolicyJSON == nil {
		b, err := MarshalRolePolicy(policy.DefaultRolePolicy())
		if err != nil {
			return err
		}
		p.RolePolicyJSON = b
	}
	if p.IsDefault {
		if _, err := s.DB.Pool.Exec(ctx, `UPDATE launcher_profiles SET is_default = false WHERE is_default`); err != nil {
			return err
		}
	}
	const q = `
        INSERT INTO launcher_profiles (id, name, slug, description, is_default, version, seed_path, role_policy_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`
	_, err := s.DB.Pool.Exec(ctx, q,
		p.ID, p.Name, p.Slug, p.Description, p.IsDefault, p.Version, p.SeedPath, p.RolePolicyJSON,
	)
	return err
}

func (s *LauncherProfileStore) Update(ctx context.Context, p *LauncherProfile) error {
	if p.IsDefault {
		if _, err := s.DB.Pool.Exec(ctx, `UPDATE launcher_profiles SET is_default = false WHERE id <> $1`, p.ID); err != nil {
			return err
		}
	}
	const q = `
        UPDATE launcher_profiles
        SET name = $2,
            slug = $3,
            description = $4,
            is_default = $5,
            version = version + 1,
            seed_path = $6,
            role_policy_json = $7,
            updated_at = now()
        WHERE id = $1
        RETURNING version, updated_at`
	err := s.DB.Pool.QueryRow(ctx, q,
		p.ID, p.Name, p.Slug, p.Description, p.IsDefault, p.SeedPath, p.RolePolicyJSON,
	).Scan(&p.Version, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrLauncherProfileNotFound
	}
	return err
}

func (s *LauncherProfileStore) Delete(ctx context.Context, id string) error {
	ct, err := s.DB.Pool.Exec(ctx, `DELETE FROM launcher_profiles WHERE id = $1 AND is_default = false`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrLauncherProfileNotFound
	}
	return nil
}

func (s *LauncherProfileStore) Get(ctx context.Context, id string) (*LauncherProfile, error) {
	q := `SELECT ` + launcherProfileCols + ` FROM launcher_profiles WHERE id = $1`
	p, err := scanLauncherProfile(s.DB.Pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrLauncherProfileNotFound
	}
	return p, err
}

func (s *LauncherProfileStore) GetDefault(ctx context.Context) (*LauncherProfile, error) {
	q := `SELECT ` + launcherProfileCols + ` FROM launcher_profiles WHERE is_default = true ORDER BY created_at ASC LIMIT 1`
	p, err := scanLauncherProfile(s.DB.Pool.QueryRow(ctx, q))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrLauncherProfileNotFound
	}
	return p, err
}

func (s *LauncherProfileStore) List(ctx context.Context) ([]*LauncherProfile, error) {
	q := `SELECT ` + launcherProfileCols + ` FROM launcher_profiles ORDER BY is_default DESC, name ASC`
	rows, err := s.DB.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*LauncherProfile
	for rows.Next() {
		p, err := scanLauncherProfile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *LauncherProfileStore) SetVersion(ctx context.Context, id string, version int64) error {
	_, err := s.DB.Pool.Exec(ctx, `UPDATE launcher_profiles SET version = $2, updated_at = now() WHERE id = $1`, id, version)
	return err
}
