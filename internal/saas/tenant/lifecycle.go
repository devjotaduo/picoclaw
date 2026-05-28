package tenant

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// Suspend stops the container (graceful 30s). Volume and DB row remain.
func (p *Provisioner) Suspend(ctx context.Context, id string) error {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return err
	}
	if t.ContainerID == nil || *t.ContainerID == "" {
		return errors.New("tenant has no container")
	}
	if err := p.Docker.Stop(ctx, *t.ContainerID, 30); err != nil {
		return fmt.Errorf("docker stop: %w", err)
	}
	return p.Tenants.MarkSuspended(ctx, id)
}

func (p *Provisioner) Resume(ctx context.Context, id string) error {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return err
	}
	if t.ContainerID == nil || *t.ContainerID == "" {
		return errors.New("tenant has no container")
	}
	if err := p.Docker.Start(ctx, *t.ContainerID); err != nil {
		return fmt.Errorf("docker start: %w", err)
	}
	return p.Tenants.MarkResumed(ctx, id)
}

// Restart cycles the tenant's container so picoclaw re-reads workspace files
// (AGENT.md, SOUL.md, skills/*) into memory.
func (p *Provisioner) Restart(ctx context.Context, id string) error {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return err
	}
	if t.ContainerID == nil || *t.ContainerID == "" {
		return errors.New("tenant has no container")
	}
	if err := p.Docker.Stop(ctx, *t.ContainerID, 10); err != nil {
		return fmt.Errorf("docker stop: %w", err)
	}
	if err := p.Docker.Start(ctx, *t.ContainerID); err != nil {
		return fmt.Errorf("docker start: %w", err)
	}
	return nil
}

// Recreate stops and removes the existing container and creates+starts a
// fresh one from the spec built off the current TENANT_IMAGE/config. Use
// after the tenant image has been rebuilt — Docker has no in-place image
// swap, so the container must be recreated for the new layers to take
// effect. The bind-mounted volume is preserved, so per-tenant state
// (whatsapp/store.db, sessions, memory) survives unchanged.
func (p *Provisioner) Recreate(ctx context.Context, id string) error {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return err
	}
	if p.Cfg.TenantImage != "" {
		t.ContainerImage = p.Cfg.TenantImage
	}
	cliClaude, cliCodex := p.sharedCLIModelRouting()
	if p.Cfg != nil {
		if codexDir, err := resolveCodexCLIAuthDir(p.Cfg.TenantCodexCliAuthDir); err != nil {
			return fmt.Errorf("resolve codex cli auth dir: %w", err)
		} else if codexDir != "" {
			if err := prepareCodexCLIHome(t.VolumePath, codexDir); err != nil {
				return fmt.Errorf("prepare codex cli home: %w", err)
			}
		}
	}
	if cliClaude || cliCodex {
		rawWorkspace, err := p.tenantUsesRawWorkspace(ctx, t)
		if err != nil {
			return fmt.Errorf("lookup workspace for cli routing: %w", err)
		}
		if !rawWorkspace {
			if err := ApplySaaSCLIModelRouting(t.VolumePath, cliClaude, cliCodex); err != nil {
				return fmt.Errorf("apply saas cli model routing: %w", err)
			}
		}
	}
	if codexDir, err := resolveCodexCLIAuthDir(p.Cfg.TenantCodexCliAuthDir); err != nil {
		return fmt.Errorf("resolve codex cli auth dir: %w", err)
	} else if codexDir != "" {
		if err := prepareCodexCLIHome(t.VolumePath, codexDir); err != nil {
			return fmt.Errorf("prepare codex cli home: %w", err)
		}
	}
	spec, err := p.buildSpec(ctx, t)
	if err != nil {
		return fmt.Errorf("build spec: %w", err)
	}
	// Address by container name rather than DB-recorded ID: the row can drift
	// out of sync if a container was recreated out-of-band (e.g. manual docker
	// run during incident response), and the name is the stable identity.
	_ = p.Docker.Stop(ctx, spec.Name, 10)
	if err := p.Docker.Remove(ctx, spec.Name); err != nil && !errors.Is(err, ErrContainerNotFound) {
		return fmt.Errorf("docker remove: %w", err)
	}
	cid, err := p.Docker.CreateAndStart(ctx, spec)
	if err != nil {
		_ = p.Tenants.ClearContainerID(ctx, id)
		return fmt.Errorf("docker create: %w", err)
	}
	if err := p.Tenants.SetContainer(ctx, id, cid); err != nil {
		return fmt.Errorf("set container: %w", err)
	}
	if err := p.Docker.WaitRunning(ctx, cid, 60*time.Second); err != nil {
		return err
	}
	return p.Tenants.SetStatus(ctx, id, store.StatusActive, nil)
}

func (p *Provisioner) tenantUsesRawWorkspace(ctx context.Context, t *store.Tenant) (bool, error) {
	if p == nil || p.Workspaces == nil || t == nil || t.WorkspaceID == nil || *t.WorkspaceID == "" {
		return false, nil
	}
	ws, err := p.Workspaces.Get(ctx, *t.WorkspaceID)
	if err != nil {
		return false, err
	}
	return ws != nil && ws.IsRaw, nil
}

// SupabaseManager is the narrow interface the provisioner uses to mutate the
// Supabase Auth user during destructive ops (delete, password rotate).
// Lifecycle code stays decoupled from the concrete *auth.SupabaseClient (and
// from Supabase being configured at all — nil is a valid value, meaning
// "skip the call").
type SupabaseManager interface {
	DeleteTenantUser(userID string) error
	UpdateUserPassword(userID, newPassword string) error
}

// SupabaseDeleter is kept as an alias of SupabaseManager so existing call
// sites that only need delete remain compilable.
type SupabaseDeleter = SupabaseManager

// Delete marks the tenant deleting, removes all runtime resources, and marks
// the cleanup as completed. The row stays in the DB with deleted_at set and
// cleanup_completed_at set — historical, but recoverable from the archived
// volume tarball when Cfg.TenantBackupDir is configured. A separate
// retention job is responsible for the final DeleteCascade after the
// retention window (rows with cleanup_completed_at NOT NULL are candidates).
//
// If the process dies between SoftDelete and MarkCleanupCompleted, the
// reconciler picks the row up via ListPendingCleanup and resumes the same
// cleanup pipeline.
func (p *Provisioner) Delete(ctx context.Context, id string) error {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := p.Tenants.SoftDelete(ctx, id); err != nil {
		return err
	}
	if err := p.cleanupDeletedTenant(ctx, t); err != nil {
		return err
	}
	if err := p.Tenants.MarkCleanupCompleted(ctx, id); err != nil {
		return fmt.Errorf("mark cleanup completed: %w", err)
	}
	return nil
}

func (p *Provisioner) cleanupDeletedTenant(ctx context.Context, t *store.Tenant) error {
	if p.Docker != nil {
		refs := []string{"tenant-" + t.ID}
		if t.ContainerID != nil && *t.ContainerID != "" {
			refs = append(refs, *t.ContainerID)
		}
		if err := p.Docker.RemoveTenantContainers(ctx, t.ID, refs...); err != nil {
			return fmt.Errorf("docker remove: %w", err)
		}
	}
	if p.LiteLLM != nil && t.LiteLLMKeyID != nil && *t.LiteLLMKeyID != "" {
		if err := p.LiteLLM.DeleteKey(ctx, t.ID); err != nil {
			return fmt.Errorf("litellm delete: %w", err)
		}
	}
	// Supabase user cleanup is best-effort: the runtime resources are already
	// gone by this point, so a stuck Supabase delete shouldn't block the row
	// removal. If the user is already deleted (manual cleanup, prior crash),
	// the Admin API returns 404 and we ignore it.
	if p.Supabase != nil && t.AuthBackend == "supabase" && t.SupabaseUserID != nil && *t.SupabaseUserID != "" {
		_ = p.Supabase.DeleteTenantUser(*t.SupabaseUserID)
	}
	if t.VolumePath != "" {
		// Prefer archive-then-remove so a misclick is recoverable. Falls back
		// to plain RemoveVolume when no backup dir is configured.
		if p.Cfg != nil && p.Cfg.TenantBackupDir != "" {
			if err := ArchiveAndRemoveVolume(ctx, t.ID, t.VolumePath, p.Cfg.TenantBackupDir); err != nil {
				return fmt.Errorf("archive volume: %w", err)
			}
		} else if err := RemoveVolume(ctx, t.VolumePath); err != nil {
			return fmt.Errorf("volume cleanup: %w", err)
		}
	}
	return nil
}

// RotatePassword issues a new credential for the tenant and invalidates the
// old one EVERYWHERE it could still be honored:
//   - launcher-auth.db (local bcrypt hash) is reseeded for local-mode tenants
//   - Supabase Auth user has its password reset for auth_backend='supabase'
//   - all active sessions for the tenant's members are revoked
//   - the container is restarted so in-memory caches drop the old hash
//
// Returns the plaintext password to the caller exactly once.
//
// Without these extra steps the function was cosmetic: for Supabase tenants
// the launcher never reads launcher-auth.db, so the old password kept
// working until the user manually changed it; and for local tenants the
// existing session cookie stayed valid until its TTL.
func (p *Provisioner) RotatePassword(ctx context.Context, id string) (string, error) {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return "", err
	}
	password, err := auth.GeneratePassword()
	if err != nil {
		return "", err
	}

	// 1. Update wherever the password is actually checked.
	switch t.AuthBackend {
	case "supabase":
		if p.Supabase == nil {
			return "", errors.New("rotate password: Supabase manager not configured for supabase-backed tenant")
		}
		if t.SupabaseUserID == nil || *t.SupabaseUserID == "" {
			return "", errors.New("rotate password: tenant has no Supabase user id recorded")
		}
		if err := p.Supabase.UpdateUserPassword(*t.SupabaseUserID, password); err != nil {
			return "", fmt.Errorf("supabase update password: %w", err)
		}
		// Legacy launcher-auth.db is irrelevant for this backend; do not
		// write it (would just leave a stale hash on disk pretending to be
		// live).
	default:
		// Local backend: rewrite the on-disk bcrypt hash.
		if err := SeedDashboardCredentials(ctx, t.VolumePath, t.OwnerEmail, password); err != nil {
			return "", err
		}
	}

	// 2. Revoke any currently-active sessions for any member of this tenant.
	// If we skip this, the attacker who triggered the rotation keeps the
	// session cookie they already captured.
	if p.Sessions != nil {
		if err := p.Sessions.RevokeAllForTenant(ctx, id); err != nil {
			return "", fmt.Errorf("revoke sessions: %w", err)
		}
	}

	// 3. Restart the container so in-process caches drop the old credential.
	if t.ContainerID != nil && *t.ContainerID != "" {
		_ = p.Docker.Stop(ctx, *t.ContainerID, 10)
		if err := p.Docker.Start(ctx, *t.ContainerID); err != nil {
			return "", fmt.Errorf("restart: %w", err)
		}
	}

	// 4. Re-flag admin UI so the operator knows the new password is pending
	// re-delivery to the owner.
	const q = `UPDATE tenants SET initial_password_delivered = false WHERE id = $1`
	if _, err := p.Tenants.DB.Pool.Exec(ctx, q, id); err != nil {
		return "", err
	}
	return password, nil
}
