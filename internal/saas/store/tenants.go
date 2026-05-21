package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrTenantNotFound = errors.New("tenant not found")

type TenantStatus string

const (
	StatusProvisioning TenantStatus = "provisioning"
	StatusActive       TenantStatus = "active"
	StatusSuspended    TenantStatus = "suspended"
	StatusDeleting     TenantStatus = "deleting"
	StatusError        TenantStatus = "error"
)

type Tenant struct {
	ID                            string
	DisplayName                   string
	OwnerEmail                    string
	Subdomain                     string
	Status                        TenantStatus
	ContainerID                   *string
	ContainerImage                string
	VolumePath                    string
	LiteLLMKeyID                  *string
	LiteLLMKeyHash                *string
	MonthlyBudgetUSD              *float64
	MemLimitMB                    int
	CPUQuota                      float64
	InitialPasswordDelivered      bool
	LastError                     *string
	CreatedAt                     time.Time
	SuspendedAt                   *time.Time
	DeletedAt                     *time.Time
	CleanupCompletedAt            *time.Time
	CRMContactID                  *int64
	CRMCompanyID                  *int64
	CRMDealID                     *int64
	LauncherProfileID             *string
	LauncherProfileVersionApplied *int64
	// SupabaseUserID is set when this tenant's dashboard auth is handled by
	// Supabase (AuthBackend = "supabase"). Empty for legacy local-auth tenants.
	SupabaseUserID *string
	// AuthBackend selects how the controlplane validates dashboard requests
	// for this tenant: "local" (sessions table) or "supabase" (verify JWT).
	AuthBackend string
	// IsPublic: when true, tenant launcher accepts anonymous traffic on
	// /api/public/* routes (no Supabase JWT). Used by the onboarding tenant
	// serving /pre-cadastro visitors.
	IsPublic bool
}

type TenantStore struct{ DB *DB }

const tenantCols = `tenants.id, tenants.display_name, tenants.owner_email, tenants.subdomain, tenants.status, tenants.container_id,
    tenants.container_image, tenants.volume_path, tenants.litellm_key_id, tenants.litellm_key_hash, tenants.monthly_budget_usd,
    tenants.mem_limit_mb, tenants.cpu_quota, tenants.initial_password_delivered, tenants.last_error,
    tenants.created_at, tenants.suspended_at, tenants.deleted_at, tenants.cleanup_completed_at,
    tenants.crm_contact_id, tenants.crm_company_id, tenants.crm_deal_id,
    tenants.launcher_profile_id, tenants.launcher_profile_version_applied,
    tenants.supabase_user_id::text, tenants.auth_backend, tenants.is_public`

func scanTenant(row pgx.Row) (*Tenant, error) {
	var t Tenant
	err := row.Scan(
		&t.ID, &t.DisplayName, &t.OwnerEmail, &t.Subdomain, &t.Status, &t.ContainerID,
		&t.ContainerImage, &t.VolumePath, &t.LiteLLMKeyID, &t.LiteLLMKeyHash, &t.MonthlyBudgetUSD,
		&t.MemLimitMB, &t.CPUQuota, &t.InitialPasswordDelivered, &t.LastError,
		&t.CreatedAt, &t.SuspendedAt, &t.DeletedAt, &t.CleanupCompletedAt,
		&t.CRMContactID, &t.CRMCompanyID, &t.CRMDealID,
		&t.LauncherProfileID, &t.LauncherProfileVersionApplied,
		&t.SupabaseUserID, &t.AuthBackend, &t.IsPublic,
	)
	return &t, err
}

func (s *TenantStore) Insert(ctx context.Context, t *Tenant) error {
	backend := t.AuthBackend
	if backend == "" {
		backend = "local"
	}
	const q = `
		INSERT INTO tenants (id, display_name, owner_email, subdomain, status,
		                     container_image, volume_path, monthly_budget_usd,
		                     mem_limit_mb, cpu_quota, launcher_profile_id,
		                     launcher_profile_version_applied, auth_backend, is_public)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`
	_, err := s.DB.Pool.Exec(ctx, q,
		t.ID, t.DisplayName, t.OwnerEmail, t.Subdomain, t.Status,
		t.ContainerImage, t.VolumePath, t.MonthlyBudgetUSD,
		t.MemLimitMB, t.CPUQuota, t.LauncherProfileID, t.LauncherProfileVersionApplied,
		backend, t.IsPublic,
	)
	return err
}

// GetByOwnerEmail looks up an active (non-deleted) tenant by the email we
// stored when the owner was provisioned. Used by auto-provision to dedup
// repeat conversations from the same user.
func (s *TenantStore) GetByOwnerEmail(ctx context.Context, email string) (*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants WHERE lower(owner_email) = lower($1) AND deleted_at IS NULL LIMIT 1`
	t, err := scanTenant(s.DB.Pool.QueryRow(ctx, q, email))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTenantNotFound
	}
	return t, err
}

// SetSupabaseUserID records the Supabase Auth UUID for this tenant and flips
// auth_backend to 'supabase' so the gateway middleware switches code paths.
func (s *TenantStore) SetSupabaseUserID(ctx context.Context, tenantID, supabaseUserID string) error {
	const q = `UPDATE tenants
	           SET supabase_user_id = $2::uuid, auth_backend = 'supabase'
	           WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, tenantID, supabaseUserID)
	return err
}

func (s *TenantStore) Get(ctx context.Context, id string) (*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants WHERE id = $1 AND deleted_at IS NULL`
	t, err := scanTenant(s.DB.Pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTenantNotFound
	}
	return t, err
}

// GetIncludingDeleted returns a tenant even if soft-deleted. Used by the
// reconciler during cleanup of in-progress deletes.
func (s *TenantStore) GetIncludingDeleted(ctx context.Context, id string) (*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants WHERE id = $1`
	t, err := scanTenant(s.DB.Pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTenantNotFound
	}
	return t, err
}

// ListPendingCleanup returns tenants that are soft-deleted but haven't
// finished their cleanup pipeline (container rm + LiteLLM key delete + volume rm + DB cascade).
func (s *TenantStore) ListPendingCleanup(ctx context.Context) ([]*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants
	      WHERE status = 'deleting' AND cleanup_completed_at IS NULL`
	rows, err := s.DB.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Tenant
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// MarkCleanupCompleted is the terminal state for a deleted tenant. After this
// the row is just historical; the reconciler ignores it.
func (s *TenantStore) MarkCleanupCompleted(ctx context.Context, id string) error {
	const q = `UPDATE tenants SET cleanup_completed_at = now(), container_id = NULL,
	           litellm_key_id = NULL WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id)
	return err
}

func (s *TenantStore) GetBySubdomain(ctx context.Context, sub string) (*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants WHERE subdomain = $1 AND deleted_at IS NULL`
	t, err := scanTenant(s.DB.Pool.QueryRow(ctx, q, sub))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTenantNotFound
	}
	return t, err
}

func (s *TenantStore) List(ctx context.Context, includeDeleted bool) ([]*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants`
	if !includeDeleted {
		q += ` WHERE deleted_at IS NULL`
	}
	q += ` ORDER BY created_at DESC`
	rows, err := s.DB.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Tenant
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *TenantStore) ListForUser(ctx context.Context, userID int64) ([]*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants
	      JOIN tenant_memberships tm ON tm.tenant_id = tenants.id
	      WHERE tm.user_id = $1 AND tenants.deleted_at IS NULL
	      ORDER BY tenants.created_at DESC`
	rows, err := s.DB.Pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Tenant
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *TenantStore) ListByStatus(ctx context.Context, status TenantStatus) ([]*Tenant, error) {
	q := `SELECT ` + tenantCols + ` FROM tenants WHERE status = $1 AND deleted_at IS NULL`
	rows, err := s.DB.Pool.Query(ctx, q, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Tenant
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *TenantStore) SetStatus(ctx context.Context, id string, status TenantStatus, lastErr *string) error {
	const q = `UPDATE tenants SET status = $1, last_error = $2 WHERE id = $3`
	_, err := s.DB.Pool.Exec(ctx, q, status, lastErr, id)
	return err
}

func (s *TenantStore) SetContainer(ctx context.Context, id, containerID string) error {
	const q = `UPDATE tenants SET container_id = $1 WHERE id = $2`
	_, err := s.DB.Pool.Exec(ctx, q, containerID, id)
	return err
}

func (s *TenantStore) SetLiteLLMKey(ctx context.Context, id, keyID, keyHash string) error {
	const q = `UPDATE tenants SET litellm_key_id = $1, litellm_key_hash = $2 WHERE id = $3`
	_, err := s.DB.Pool.Exec(ctx, q, keyID, keyHash, id)
	return err
}

func (s *TenantStore) SetLauncherProfileApplied(ctx context.Context, id, profileID string, version int64) error {
	const q = `UPDATE tenants SET launcher_profile_id = $2, launcher_profile_version_applied = $3 WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id, profileID, version)
	return err
}

func (s *TenantStore) MarkSuspended(ctx context.Context, id string) error {
	const q = `UPDATE tenants SET status = 'suspended', suspended_at = now() WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id)
	return err
}

func (s *TenantStore) MarkResumed(ctx context.Context, id string) error {
	const q = `UPDATE tenants SET status = 'active', suspended_at = NULL WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id)
	return err
}

func (s *TenantStore) SoftDelete(ctx context.Context, id string) error {
	const q = `UPDATE tenants SET status = 'deleting', deleted_at = COALESCE(deleted_at, now()) WHERE id = $1`
	tag, err := s.DB.Pool.Exec(ctx, q, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTenantNotFound
	}
	return nil
}

// DeleteCascade removes the tenant row after external resources are gone. The
// database foreign keys then cascade memberships, invites, and usage while
// audit logs keep history with a NULL tenant_id.
func (s *TenantStore) DeleteCascade(ctx context.Context, id string) error {
	const q = `DELETE FROM tenants WHERE id = $1`
	tag, err := s.DB.Pool.Exec(ctx, q, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTenantNotFound
	}
	return nil
}

func (s *TenantStore) MarkPasswordDelivered(ctx context.Context, id string) error {
	const q = `UPDATE tenants SET initial_password_delivered = true WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id)
	return err
}

// SetCRMContact records the open-crm contact id created for this tenant.
// Best-effort; not load-bearing for any other flow.
func (s *TenantStore) SetCRMContact(ctx context.Context, tenantID string, contactID int64) error {
	const q = `UPDATE tenants SET crm_contact_id = $2 WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, tenantID, contactID)
	return err
}

// CRMLinks holds the optional open-crm IDs linked to a tenant.
type CRMLinks struct {
	ContactID *int64
	CompanyID *int64
	DealID    *int64
}

// SetCRMLinks updates all three CRM foreign keys at once. Any nil pointer
// clears the corresponding column.
func (s *TenantStore) SetCRMLinks(ctx context.Context, tenantID string, links CRMLinks) error {
	const q = `UPDATE tenants SET crm_contact_id=$2, crm_company_id=$3, crm_deal_id=$4 WHERE id=$1`
	_, err := s.DB.Pool.Exec(ctx, q, tenantID, links.ContactID, links.CompanyID, links.DealID)
	return err
}
