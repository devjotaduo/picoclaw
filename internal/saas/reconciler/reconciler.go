package reconciler

import (
	"context"
	"errors"
	"log"
	"path/filepath"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// DockerOps is the minimal Docker API surface the reconciler depends on.
// The concrete tenant.DockerClient satisfies it; tests use a stub.
type DockerOps interface {
	ListManaged(ctx context.Context) ([]tenant.ManagedContainer, error)
	Inspect(ctx context.Context, id string) (bool, error)
	Start(ctx context.Context, id string) error
	Stop(ctx context.Context, id string, timeoutSec int) error
	Remove(ctx context.Context, id string) error
}

type Reconciler struct {
	DB               *store.DB
	Docker           DockerOps
	LiteLLM          *litellm.Client
	BackupDir        string // /srv/saas/backups/deleted
	HostDataDir      string // /srv/saas/tenants
	Interval         time.Duration
	StartFailCap     int           // give up auto-starting after N consecutive failures
	ProvisionTimeout time.Duration // mark stuck provisions as error after this
}

// Run loops forever until ctx is cancelled, ticking the reconciler.
func (r *Reconciler) Run(ctx context.Context) {
	if r.Interval <= 0 {
		r.Interval = 30 * time.Second
	}
	if r.StartFailCap <= 0 {
		r.StartFailCap = 3
	}
	if r.ProvisionTimeout <= 0 {
		r.ProvisionTimeout = 5 * time.Minute
	}
	t := time.NewTicker(r.Interval)
	defer t.Stop()
	r.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			r.tick(ctx)
		}
	}
}

// startFails tracks consecutive failed Start attempts per tenant id, in-process.
// Resets to 0 on success or on suspend/delete.
type startTracker struct {
	fails map[string]int
}

func (s *startTracker) bump(id string) int {
	if s.fails == nil {
		s.fails = map[string]int{}
	}
	s.fails[id]++
	return s.fails[id]
}
func (s *startTracker) clear(id string) {
	delete(s.fails, id)
}

var failsTracker = &startTracker{}

func (r *Reconciler) tick(ctx context.Context) {
	r.reconcileActive(ctx)
	r.reconcileDeleting(ctx)
	r.reconcileOrphans(ctx)
	r.reconcileStuckProvisions(ctx)
}

// reconcileActive ensures every active tenant has a running container.
func (r *Reconciler) reconcileActive(ctx context.Context) {
	ts := &store.TenantStore{DB: r.DB}
	tenants, err := ts.ListByStatus(ctx, store.StatusActive)
	if err != nil {
		log.Printf("reconciler: list active: %v", err)
		return
	}
	for _, t := range tenants {
		if t.ContainerID == nil || *t.ContainerID == "" {
			continue
		}
		running, err := r.Docker.Inspect(ctx, *t.ContainerID)
		if errors.Is(err, tenant.ErrContainerNotFound) {
			log.Printf("reconciler: %s: container %s gone, marking error", t.ID, *t.ContainerID)
			msg := "container vanished; needs manual provisioning"
			_ = ts.SetStatus(ctx, t.ID, store.StatusError, &msg)
			continue
		}
		if err != nil {
			log.Printf("reconciler: %s: inspect: %v", t.ID, err)
			continue
		}
		if running {
			failsTracker.clear(t.ID)
			continue
		}
		// Container exists but isn't running — try to start it.
		if err := r.Docker.Start(ctx, *t.ContainerID); err != nil {
			n := failsTracker.bump(t.ID)
			log.Printf("reconciler: %s: start failed (attempt %d): %v", t.ID, n, err)
			if n >= r.StartFailCap {
				msg := "container failed to start " + err.Error()
				_ = ts.SetStatus(ctx, t.ID, store.StatusError, &msg)
				failsTracker.clear(t.ID)
			}
		} else {
			log.Printf("reconciler: %s: restarted container %s", t.ID, *t.ContainerID)
			failsTracker.clear(t.ID)
		}
	}
}

// reconcileDeleting completes the deletion pipeline for soft-deleted tenants
// whose cleanup didn't finish (control plane crashed, container API blip, etc.).
// Each step is idempotent.
func (r *Reconciler) reconcileDeleting(ctx context.Context) {
	ts := &store.TenantStore{DB: r.DB}
	pending, err := ts.ListPendingCleanup(ctx)
	if err != nil {
		log.Printf("reconciler: list pending cleanup: %v", err)
		return
	}
	for _, t := range pending {
		if err := r.completeCleanup(ctx, t); err != nil {
			log.Printf("reconciler: %s: cleanup: %v", t.ID, err)
		}
	}
}

func (r *Reconciler) completeCleanup(ctx context.Context, t *store.Tenant) error {
	if t.ContainerID != nil && *t.ContainerID != "" {
		_ = r.Docker.Stop(ctx, *t.ContainerID, 10)
		if err := r.Docker.Remove(ctx, *t.ContainerID); err != nil && !errors.Is(err, tenant.ErrContainerNotFound) {
			return err
		}
	}
	if r.LiteLLM != nil && t.LiteLLMKeyID != nil && *t.LiteLLMKeyID != "" {
		if err := r.LiteLLM.DeleteKey(ctx, t.ID); err != nil {
			log.Printf("reconciler: %s: litellm delete (non-fatal): %v", t.ID, err)
		}
	}
	if t.VolumePath != "" {
		if err := tenant.ArchiveAndRemoveVolume(ctx, t.ID, t.VolumePath, r.BackupDir); err != nil {
			return err
		}
	}
	return (&store.TenantStore{DB: r.DB}).MarkCleanupCompleted(ctx, t.ID)
}

// reconcileOrphans kills any container with picoclaw.saas.managed=true whose tenant
// doesn't exist in the DB (or is already soft-deleted+cleaned).
func (r *Reconciler) reconcileOrphans(ctx context.Context) {
	ts := &store.TenantStore{DB: r.DB}
	r.reconcileOrphansAgainstDB(ctx, r.Docker, func(id string) (alive, cleaned, found bool) {
		t, err := ts.GetIncludingDeleted(ctx, id)
		if errors.Is(err, store.ErrTenantNotFound) {
			return false, false, false
		}
		if err != nil {
			log.Printf("reconciler: orphan check %s: %v", id, err)
			return true, false, true // be conservative: don't kill on transient DB errors
		}
		return t.CleanupCompletedAt == nil, t.CleanupCompletedAt != nil, true
	})
	_ = filepath.Separator
}

// reconcileOrphansAgainstDB is the DB-independent core, isolated for testing.
// The lookup callback returns (alive, cleaned, found): a tenant is treated as
// an orphan when found==false; a zombie when cleaned==true.
func (r *Reconciler) reconcileOrphansAgainstDB(
	ctx context.Context,
	d DockerOps,
	lookup func(tenantID string) (alive, cleaned, found bool),
) {
	containers, err := d.ListManaged(ctx)
	if err != nil {
		log.Printf("reconciler: list managed: %v", err)
		return
	}
	for _, c := range containers {
		if c.TenantID == "" {
			continue
		}
		alive, cleaned, found := lookup(c.TenantID)
		if alive && !cleaned {
			continue
		}
		if !found {
			log.Printf("reconciler: orphan container %s (tenant %s not in DB) — removing",
				c.Name, c.TenantID)
		} else if cleaned {
			log.Printf("reconciler: zombie container %s (tenant %s cleaned) — removing",
				c.Name, c.TenantID)
		}
		_ = d.Stop(ctx, c.ID, 5)
		_ = d.Remove(ctx, c.ID)
	}
}

// reconcileStuckProvisions marks tenants stuck in 'provisioning' state past the
// timeout as errors so the admin sees them.
func (r *Reconciler) reconcileStuckProvisions(ctx context.Context) {
	ts := &store.TenantStore{DB: r.DB}
	tenants, err := ts.ListByStatus(ctx, store.StatusProvisioning)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-r.ProvisionTimeout)
	for _, t := range tenants {
		if t.CreatedAt.Before(cutoff) {
			msg := "provisioning timeout"
			_ = ts.SetStatus(ctx, t.ID, store.StatusError, &msg)
			log.Printf("reconciler: %s: marked error (stuck in provisioning)", t.ID)
		}
	}
}
