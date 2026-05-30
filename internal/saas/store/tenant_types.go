package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrTenantTypeNotFound is returned by TenantTypeStore reads when no row
// matches the lookup. Callers in the API layer map this to 404.
var ErrTenantTypeNotFound = errors.New("tenant type not found")

// TenantType is one entry in the v2.0 data-driven tenant type catalog. It maps
// the admin-facing vertical (clinica, loja, ...) to the runtime ui-visibility
// profile, the seed workspace, the agent roster to materialize, and the tier
// defaults pre-filled in the create wizard. The three system types
// (publico/admin/cliente) preserve the v1 admin vocabulary so existing callers
// keep resolving. See migration 0018_tenant_types.sql.
type TenantType struct {
	Slug        string
	DisplayName string
	Description string
	Icon        string
	// Category is the admin-facing family; UIProfile is the runtime
	// ui-visibility active_profile (public/tenant/admin) it resolves to.
	Category  string
	UIProfile string
	// DefaultWorkspaceID is the seed workspace for this vertical; empty means
	// fall back to the default-auto workspace at provision time.
	DefaultWorkspaceID string
	// RosterJSON is the ordered list of agent role specs to materialize, e.g.
	// ["attendant","assistant"]. Empty/[] lets the provisioner fall back to the
	// workspace's own roster.
	RosterJSON json.RawMessage
	// DefaultsJSON carries lightweight tier defaults (budget, mem, cpu,
	// channels, per-agent skills) pre-filled in the admin create wizard.
	DefaultsJSON json.RawMessage
	IsSystem     bool
	IsSelectable bool
	SortOrder    int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// TenantTypeStore is the data access layer for the tenant type catalog. Mirrors
// WorkspaceStore: a thin struct over the shared *DB pgx pool.
type TenantTypeStore struct{ DB *DB }

const tenantTypeCols = `slug, display_name, description, icon, category,
    ui_profile, default_workspace_id, roster_json, defaults_json,
    is_system, is_selectable, sort_order, created_at, updated_at`

func scanTenantType(row pgx.Row) (*TenantType, error) {
	var t TenantType
	var defaultWorkspaceID *string
	var rosterJSON, defaultsJSON []byte
	if err := row.Scan(
		&t.Slug, &t.DisplayName, &t.Description, &t.Icon, &t.Category,
		&t.UIProfile, &defaultWorkspaceID, &rosterJSON, &defaultsJSON,
		&t.IsSystem, &t.IsSelectable, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if defaultWorkspaceID != nil {
		t.DefaultWorkspaceID = *defaultWorkspaceID
	}
	if len(rosterJSON) > 0 {
		t.RosterJSON = json.RawMessage(rosterJSON)
	}
	if len(defaultsJSON) > 0 {
		t.DefaultsJSON = json.RawMessage(defaultsJSON)
	}
	return &t, nil
}

// Get fetches a single tenant type by slug. Slug is normalized (trimmed +
// lowercased) so the admin vocabulary and runtime stay aligned.
func (s *TenantTypeStore) Get(ctx context.Context, slug string) (*TenantType, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	q := `SELECT ` + tenantTypeCols + ` FROM tenant_types WHERE slug = $1`
	t, err := scanTenantType(s.DB.Pool.QueryRow(ctx, q, slug))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTenantTypeNotFound
	}
	return t, err
}

// List returns all tenant types ordered by sort_order then name. When
// selectableOnly is true, only types the admin wizard should offer are
// returned.
func (s *TenantTypeStore) List(ctx context.Context, selectableOnly bool) ([]*TenantType, error) {
	q := `SELECT ` + tenantTypeCols + ` FROM tenant_types`
	if selectableOnly {
		q += ` WHERE is_selectable = true`
	}
	q += ` ORDER BY sort_order ASC, display_name ASC`
	rows, err := s.DB.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*TenantType
	for rows.Next() {
		t, err := scanTenantType(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Upsert inserts or updates a tenant type by slug. The admin panel uses this to
// create/edit verticals. is_system is only honored on insert; updates never
// flip a row's system flag, so the protected vocabulary can't be downgraded.
// created_at is preserved on conflict.
func (s *TenantTypeStore) Upsert(ctx context.Context, t *TenantType) error {
	t.Slug = strings.ToLower(strings.TrimSpace(t.Slug))
	if t.SortOrder == 0 {
		t.SortOrder = 100
	}
	roster := []byte(t.RosterJSON)
	if len(roster) == 0 {
		roster = []byte("[]")
	}
	defaults := []byte(t.DefaultsJSON)
	if len(defaults) == 0 {
		defaults = []byte("{}")
	}
	var defaultWorkspaceID *string
	if strings.TrimSpace(t.DefaultWorkspaceID) != "" {
		id := t.DefaultWorkspaceID
		defaultWorkspaceID = &id
	}
	const q = `
        INSERT INTO tenant_types
            (slug, display_name, description, icon, category,
             ui_profile, default_workspace_id, roster_json, defaults_json,
             is_system, is_selectable, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (slug) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            category = EXCLUDED.category,
            ui_profile = EXCLUDED.ui_profile,
            default_workspace_id = EXCLUDED.default_workspace_id,
            roster_json = EXCLUDED.roster_json,
            defaults_json = EXCLUDED.defaults_json,
            is_selectable = EXCLUDED.is_selectable,
            sort_order = EXCLUDED.sort_order,
            updated_at = now()
        RETURNING created_at, updated_at`
	return s.DB.Pool.QueryRow(ctx, q,
		t.Slug, t.DisplayName, t.Description, t.Icon, t.Category,
		t.UIProfile, defaultWorkspaceID, roster, defaults,
		t.IsSystem, t.IsSelectable, t.SortOrder,
	).Scan(&t.CreatedAt, &t.UpdatedAt)
}

// Delete removes a tenant type by slug. System types (publico/admin/cliente)
// are protected so the admin vocabulary can never be removed out from under the
// resolver; deleting one is a no-op that returns ErrTenantTypeNotFound.
func (s *TenantTypeStore) Delete(ctx context.Context, slug string) error {
	slug = strings.ToLower(strings.TrimSpace(slug))
	ct, err := s.DB.Pool.Exec(ctx, `DELETE FROM tenant_types WHERE slug = $1 AND is_system = false`, slug)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrTenantTypeNotFound
	}
	return nil
}
