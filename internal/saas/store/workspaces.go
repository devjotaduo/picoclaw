package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sipeed/picoclaw/internal/saas/policy"
)

// ErrWorkspaceNotFound is returned by WorkspaceStore reads when no row matches
// the lookup. Callers in the API layer map this to 404.
var ErrWorkspaceNotFound = errors.New("workspace not found")

// Workspace represents one selectable tenant template. A workspace lives at
// HostPath on the host filesystem and contains three subtrees:
//
//	home/          → bind-mounted into the tenant container at /root/.picoclaw
//	frontend-src/  → React source the admin edits
//	frontend-dist/ → compiled vite output, bind-mounted read-only into the tenant
//
// The DB row carries only metadata; the actual files live on disk. The host
// path is canonicalized by the provisioner to <Cfg.WorkspaceDir>/<Slug> but
// stored explicitly so a future workspace-moved-to-different-mount can be
// represented without renaming the slug.
type Workspace struct {
	ID                string
	Name              string
	Slug              string
	Description       string
	HostPath          string
	IsDefaultAuto     bool
	IsAvailableManual bool
	RolePolicyJSON    []byte
	FrontendBuiltAt   *time.Time
	FrontendBuildLog  string
	Version           int64
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// RolePolicy unmarshals the JSONB column into a typed policy struct and
// normalizes it. Reuses MarshalRolePolicy / NormalizeRolePolicy from the
// existing policy package so workspaces and launcher profiles round-trip the
// same shape during the backfill window.
func (w *Workspace) RolePolicy() policy.RolePolicy {
	var rp policy.RolePolicy
	if len(w.RolePolicyJSON) > 0 {
		_ = json.Unmarshal(w.RolePolicyJSON, &rp)
	}
	return policy.NormalizeRolePolicy(rp)
}

type WorkspaceStore struct{ DB *DB }

const workspaceCols = `id, name, slug, description, host_path,
    is_default_auto, is_available_manual, role_policy_json,
    frontend_built_at, frontend_build_log, version, created_at, updated_at`

func scanWorkspace(row pgx.Row) (*Workspace, error) {
	var w Workspace
	err := row.Scan(
		&w.ID, &w.Name, &w.Slug, &w.Description, &w.HostPath,
		&w.IsDefaultAuto, &w.IsAvailableManual, &w.RolePolicyJSON,
		&w.FrontendBuiltAt, &w.FrontendBuildLog, &w.Version,
		&w.CreatedAt, &w.UpdatedAt,
	)
	return &w, err
}

func (s *WorkspaceStore) Insert(ctx context.Context, w *Workspace) error {
	if w.Version <= 0 {
		w.Version = 1
	}
	if w.RolePolicyJSON == nil {
		b, err := MarshalRolePolicy(policy.DefaultRolePolicy())
		if err != nil {
			return err
		}
		w.RolePolicyJSON = b
	}
	// Clear any previous default-auto so the unique partial index doesn't
	// reject the insert. The transaction wraps both statements implicitly via
	// pgx's single-connection guarantee on Exec calls in sequence.
	if w.IsDefaultAuto {
		if _, err := s.DB.Pool.Exec(ctx, `UPDATE workspaces SET is_default_auto = false WHERE is_default_auto`); err != nil {
			return err
		}
	}
	const q = `
        INSERT INTO workspaces
            (id, name, slug, description, host_path,
             is_default_auto, is_available_manual, role_policy_json, version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`
	_, err := s.DB.Pool.Exec(ctx, q,
		w.ID, w.Name, w.Slug, w.Description, w.HostPath,
		w.IsDefaultAuto, w.IsAvailableManual, w.RolePolicyJSON, w.Version,
	)
	return err
}

func (s *WorkspaceStore) Update(ctx context.Context, w *Workspace) error {
	if w.IsDefaultAuto {
		if _, err := s.DB.Pool.Exec(ctx, `UPDATE workspaces SET is_default_auto = false WHERE id <> $1`, w.ID); err != nil {
			return err
		}
	}
	const q = `
        UPDATE workspaces
        SET name = $2,
            slug = $3,
            description = $4,
            host_path = $5,
            is_default_auto = $6,
            is_available_manual = $7,
            role_policy_json = $8,
            version = version + 1,
            updated_at = now()
        WHERE id = $1
        RETURNING version, updated_at`
	err := s.DB.Pool.QueryRow(ctx, q,
		w.ID, w.Name, w.Slug, w.Description, w.HostPath,
		w.IsDefaultAuto, w.IsAvailableManual, w.RolePolicyJSON,
	).Scan(&w.Version, &w.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrWorkspaceNotFound
	}
	return err
}

// SetFrontendBuilt records the timestamp and trimmed log of the most recent
// vite build. Called from the workspace HTTP handler after BuildWorkspaceFrontend
// finishes (success or failure — the log carries the diagnostic either way).
// The log is capped at 64 KiB before being passed in.
func (s *WorkspaceStore) SetFrontendBuilt(ctx context.Context, id string, builtAt time.Time, log string) error {
	const q = `
        UPDATE workspaces
        SET frontend_built_at = $2,
            frontend_build_log = $3,
            updated_at = now()
        WHERE id = $1`
	ct, err := s.DB.Pool.Exec(ctx, q, id, builtAt, log)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrWorkspaceNotFound
	}
	return nil
}

// Delete removes a workspace. Tenants pointing at it are rejected by the FK
// (ON DELETE RESTRICT) so callers must reassign tenants before calling here.
// The default-auto workspace is also protected — clearing the flag first is
// required.
func (s *WorkspaceStore) Delete(ctx context.Context, id string) error {
	ct, err := s.DB.Pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1 AND is_default_auto = false`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrWorkspaceNotFound
	}
	return nil
}

func (s *WorkspaceStore) Get(ctx context.Context, id string) (*Workspace, error) {
	q := `SELECT ` + workspaceCols + ` FROM workspaces WHERE id = $1`
	w, err := scanWorkspace(s.DB.Pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWorkspaceNotFound
	}
	return w, err
}

func (s *WorkspaceStore) GetBySlug(ctx context.Context, slug string) (*Workspace, error) {
	q := `SELECT ` + workspaceCols + ` FROM workspaces WHERE slug = $1`
	w, err := scanWorkspace(s.DB.Pool.QueryRow(ctx, q, slug))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWorkspaceNotFound
	}
	return w, err
}

// GetDefaultAuto returns the workspace marked as the auto-provision default.
// AutoProvisioner.Run calls this when Clara qualifies a lead — if no row is
// marked, the auto-provision flow short-circuits with a clear message rather
// than picking a random workspace.
func (s *WorkspaceStore) GetDefaultAuto(ctx context.Context) (*Workspace, error) {
	q := `SELECT ` + workspaceCols + ` FROM workspaces WHERE is_default_auto = true LIMIT 1`
	w, err := scanWorkspace(s.DB.Pool.QueryRow(ctx, q))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWorkspaceNotFound
	}
	return w, err
}

// List returns all workspaces, default-auto first. When availableManualOnly
// is true, the manual-create dropdown filters out internal-only workspaces.
func (s *WorkspaceStore) List(ctx context.Context, availableManualOnly bool) ([]*Workspace, error) {
	q := `SELECT ` + workspaceCols + ` FROM workspaces`
	if availableManualOnly {
		q += ` WHERE is_available_manual = true`
	}
	q += ` ORDER BY is_default_auto DESC, name ASC`
	rows, err := s.DB.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Workspace
	for rows.Next() {
		w, err := scanWorkspace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}
