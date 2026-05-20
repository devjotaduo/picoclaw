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
	spec := p.buildSpec(t)
	// Address by container name rather than DB-recorded ID: the row can drift
	// out of sync if a container was recreated out-of-band (e.g. manual docker
	// run during incident response), and the name is the stable identity.
	_ = p.Docker.Stop(ctx, spec.Name, 10)
	if err := p.Docker.Remove(ctx, spec.Name); err != nil && !errors.Is(err, ErrContainerNotFound) {
		return fmt.Errorf("docker remove: %w", err)
	}
	cid, err := p.Docker.CreateAndStart(ctx, spec)
	if err != nil {
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

// SupabaseDeleter is the narrow interface the provisioner uses to remove the
// Supabase Auth user when a tenant is deleted. Lifecycle code stays decoupled
// from the concrete *auth.SupabaseClient (and from Supabase being configured
// at all — nil is a valid value, meaning "skip the call").
type SupabaseDeleter interface {
	DeleteTenantUser(userID string) error
}

// Delete marks the tenant deleting, removes all runtime resources, then hard
// deletes the row so database relationships cascade. If the process dies after
// SoftDelete, the reconciler resumes the same cleanup pipeline.
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
	if err := p.Tenants.DeleteCascade(ctx, id); err != nil && !errors.Is(err, store.ErrTenantNotFound) {
		return err
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
		if err := RemoveVolume(ctx, t.VolumePath); err != nil {
			return fmt.Errorf("volume cleanup: %w", err)
		}
	}
	return nil
}

// RotatePassword reseeds the launcher-auth.db with a new password. Returns the
// plaintext password to the caller exactly once.
func (p *Provisioner) RotatePassword(ctx context.Context, id string) (string, error) {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return "", err
	}
	password, err := auth.GeneratePassword()
	if err != nil {
		return "", err
	}
	if err := SeedDashboardPassword(ctx, t.VolumePath, password); err != nil {
		return "", err
	}
	// Restart container so any in-memory state in picoclaw picks up the new hash.
	if t.ContainerID != nil && *t.ContainerID != "" {
		_ = p.Docker.Stop(ctx, *t.ContainerID, 10)
		if err := p.Docker.Start(ctx, *t.ContainerID); err != nil {
			return "", fmt.Errorf("restart: %w", err)
		}
		if _, err := p.Tenants.Get(ctx, id); err != nil {
			return "", err
		}
	}
	// Mark not-yet-delivered so admin UI flags it again.
	const q = `UPDATE tenants SET initial_password_delivered = false WHERE id = $1`
	if _, err := p.Tenants.DB.Pool.Exec(ctx, q, id); err != nil {
		return "", err
	}
	return password, nil
}
