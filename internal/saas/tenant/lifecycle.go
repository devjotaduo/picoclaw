package tenant

import (
	"context"
	"errors"
	"fmt"
	"time"

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

// Delete marks the tenant deleted and best-effort stops the container. The
// remaining cleanup (LiteLLM key, volume tarball, volume rm) is handed off to
// the reconciler which is idempotent and survives crashes mid-pipeline.
func (p *Provisioner) Delete(ctx context.Context, id string) error {
	t, err := p.Tenants.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := p.Tenants.SoftDelete(ctx, id); err != nil {
		return err
	}
	if t.ContainerID != nil && *t.ContainerID != "" {
		_ = p.Docker.Stop(ctx, *t.ContainerID, 30)
		if err := p.Docker.Remove(ctx, *t.ContainerID); err != nil && !errors.Is(err, ErrContainerNotFound) {
			return fmt.Errorf("docker remove: %w", err)
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
	password, err := generatePassword()
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

// generatePassword is a thin alias kept here to avoid an auth import cycle
// from store consumers.
func generatePassword() (string, error) {
	return passwordGen()
}
