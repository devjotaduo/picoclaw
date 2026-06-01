package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// TestGetDefaultAutoReturnsMarkedWorkspace verifies that GetDefaultAuto returns
// the single workspace with is_default_auto=true, and that GetDefaultAuto
// returns ErrWorkspaceNotFound when no workspace is marked.
func TestGetDefaultAutoReturnsMarkedWorkspace(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	ws := &store.WorkspaceStore{DB: db}

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	// No workspace marked yet — expect ErrWorkspaceNotFound.
	_, err := ws.GetDefaultAuto(ctx)
	if !errors.Is(err, store.ErrWorkspaceNotFound) {
		t.Fatalf("empty state: GetDefaultAuto err = %v, want ErrWorkspaceNotFound", err)
	}

	// Insert a workspace with IsDefaultAuto=true.
	w1 := &store.Workspace{
		ID:             "default-auto-" + suffix,
		Name:           "Default Auto " + suffix,
		Slug:           "default-auto-" + suffix,
		HostPath:       "/tmp/default-auto-" + suffix,
		IsDefaultAuto:  true,
		RolePolicyJSON: []byte("{}"),
	}
	if err := ws.Insert(ctx, w1); err != nil {
		t.Fatalf("Insert(default-auto): %v", err)
	}

	// GetDefaultAuto must return it.
	got, err := ws.GetDefaultAuto(ctx)
	if err != nil {
		t.Fatalf("GetDefaultAuto after insert: %v", err)
	}
	if got.ID != w1.ID {
		t.Errorf("GetDefaultAuto returned ID=%q, want %q", got.ID, w1.ID)
	}
	if !got.IsDefaultAuto {
		t.Errorf("GetDefaultAuto returned IsDefaultAuto=false, want true")
	}

	// Inserting a second workspace with IsDefaultAuto=true must atomically
	// clear the first. GetDefaultAuto should now return the second.
	w2 := &store.Workspace{
		ID:             "default-auto-2-" + suffix,
		Name:           "Default Auto 2 " + suffix,
		Slug:           "default-auto-2-" + suffix,
		HostPath:       "/tmp/default-auto-2-" + suffix,
		IsDefaultAuto:  true,
		RolePolicyJSON: []byte("{}"),
	}
	if err := ws.Insert(ctx, w2); err != nil {
		t.Fatalf("Insert(default-auto-2): %v", err)
	}

	got2, err := ws.GetDefaultAuto(ctx)
	if err != nil {
		t.Fatalf("GetDefaultAuto after second insert: %v", err)
	}
	if got2.ID != w2.ID {
		t.Errorf("GetDefaultAuto returned ID=%q after new default, want %q", got2.ID, w2.ID)
	}

	// The first workspace must have been atomically demoted — prove the
	// demotion invariant explicitly instead of relying on GetDefaultAuto's
	// LIMIT 1 ordering.
	demoted, err := ws.Get(ctx, w1.ID)
	if err != nil {
		t.Fatalf("Get(w1) after second default: %v", err)
	}
	if demoted.IsDefaultAuto {
		t.Errorf("w1 still IsDefaultAuto=true after w2 became default; want demoted")
	}
}
