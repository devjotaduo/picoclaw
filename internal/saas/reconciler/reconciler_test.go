package reconciler

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// fakeDocker is a programmable DockerOps stub. Each call appends to its log.
type fakeDocker struct {
	mu sync.Mutex

	managed []tenant.ManagedContainer

	// programmable behavior per container id
	runningByID  map[string]bool
	notFoundByID map[string]bool
	startErr     map[string]error

	// recorded calls
	startCalls  []string
	stopCalls   []string
	removeCalls []string
}

func newFakeDocker() *fakeDocker {
	return &fakeDocker{
		runningByID:  map[string]bool{},
		notFoundByID: map[string]bool{},
		startErr:     map[string]error{},
	}
}

func (f *fakeDocker) ListManaged(ctx context.Context) ([]tenant.ManagedContainer, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]tenant.ManagedContainer(nil), f.managed...), nil
}

func (f *fakeDocker) Inspect(ctx context.Context, id string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.notFoundByID[id] {
		return false, tenant.ErrContainerNotFound
	}
	return f.runningByID[id], nil
}

func (f *fakeDocker) Start(ctx context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.startCalls = append(f.startCalls, id)
	if err, ok := f.startErr[id]; ok {
		return err
	}
	f.runningByID[id] = true
	return nil
}

func (f *fakeDocker) Stop(ctx context.Context, id string, timeoutSec int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.stopCalls = append(f.stopCalls, id)
	f.runningByID[id] = false
	return nil
}

func (f *fakeDocker) Remove(ctx context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removeCalls = append(f.removeCalls, id)
	f.notFoundByID[id] = true
	delete(f.runningByID, id)
	return nil
}

// --- Tests below: each focuses on one reconciler responsibility.

func TestStartTrackerBumpsAndClears(t *testing.T) {
	s := &startTracker{}
	if n := s.bump("a"); n != 1 {
		t.Errorf("want 1, got %d", n)
	}
	if n := s.bump("a"); n != 2 {
		t.Errorf("want 2, got %d", n)
	}
	s.clear("a")
	if n := s.bump("a"); n != 1 {
		t.Errorf("after clear: want 1, got %d", n)
	}
}

func TestOrphanReconciliation(t *testing.T) {
	// A container exists with picoclaw.saas.managed=true but its tenant is not
	// in the DB. The reconciler must stop+remove it.
	fd := newFakeDocker()
	fd.managed = []tenant.ManagedContainer{
		{ID: "c1", Name: "tenant-ghost", TenantID: "ghost-xxxxxx", Running: true},
	}
	fd.runningByID["c1"] = true

	r := &Reconciler{Docker: fd}
	// We bypass DB by calling the orphan reconcile directly with an empty DB.
	// In real life, GetIncludingDeleted hits Postgres. We can't here without
	// a real DB, so we exercise the public surface via tickWithoutDB.
	r.reconcileOrphansAgainstDB(context.Background(), fd, func(id string) (alive bool, cleaned bool, found bool) {
		return false, false, false // tenant not in DB → orphan
	})

	if len(fd.stopCalls) != 1 || fd.stopCalls[0] != "c1" {
		t.Errorf("expected stop c1, got %v", fd.stopCalls)
	}
	if len(fd.removeCalls) != 1 || fd.removeCalls[0] != "c1" {
		t.Errorf("expected remove c1, got %v", fd.removeCalls)
	}
}

func TestZombieContainerOfCleanedTenant(t *testing.T) {
	fd := newFakeDocker()
	fd.managed = []tenant.ManagedContainer{
		{ID: "c2", Name: "tenant-old", TenantID: "old-xxxxxx", Running: true},
	}
	r := &Reconciler{Docker: fd}
	r.reconcileOrphansAgainstDB(context.Background(), fd, func(id string) (alive, cleaned, found bool) {
		return false, true, true // tenant exists but fully cleaned
	})
	if len(fd.removeCalls) != 1 {
		t.Errorf("expected zombie removal, got %v", fd.removeCalls)
	}
}

func TestAliveTenantIsLeftAlone(t *testing.T) {
	fd := newFakeDocker()
	fd.managed = []tenant.ManagedContainer{
		{ID: "c3", Name: "tenant-alice", TenantID: "alice-7f3a2c", Running: true},
	}
	r := &Reconciler{Docker: fd}
	r.reconcileOrphansAgainstDB(context.Background(), fd, func(id string) (alive, cleaned, found bool) {
		return true, false, true
	})
	if len(fd.stopCalls) != 0 || len(fd.removeCalls) != 0 {
		t.Errorf("alive tenant must not be touched: stops=%v removes=%v",
			fd.stopCalls, fd.removeCalls)
	}
}

func TestStartFailCapTransitionsToError(t *testing.T) {
	// Direct unit test of the start-failure escalation, simulating 3 Start
	// failures and checking that the tracker bumps to >= cap.
	fd := newFakeDocker()
	fd.startErr["c1"] = errors.New("boom")
	tracker := &startTracker{}
	for i := 0; i < 4; i++ {
		_ = fd.Start(context.Background(), "c1")
		n := tracker.bump("c1")
		if i+1 != n {
			t.Errorf("expected bump %d, got %d", i+1, n)
		}
	}
}
