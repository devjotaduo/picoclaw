package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// TestTenantStore_Insert_DefaultsToNotPublic verifies that a tenant inserted
// without setting IsPublic round-trips with is_public=false (the schema
// default). This is the canonical case for every billable customer tenant.
func TestTenantStore_Insert_DefaultsToNotPublic(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	s := &store.TenantStore{DB: db}
	ts := time.Now().UnixNano()
	id := fmt.Sprintf("public-default-%d", ts)
	tenant := &store.Tenant{
		ID:             id,
		Subdomain:      fmt.Sprintf("test-default-%d", ts),
		DisplayName:    "Test",
		OwnerEmail:     uniqueEmail(t, "public-default"),
		ContainerImage: "picoclaw-launcher:latest",
		VolumePath:     "/tmp/t1",
		Status:         store.StatusProvisioning,
	}
	if err := s.Insert(ctx, tenant); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if got.IsPublic {
		t.Errorf("expected IsPublic=false by default, got true")
	}
}

// TestTenantStore_Insert_PublicTenant verifies the public-onboarding-tenant
// path: explicitly setting IsPublic=true persists and round-trips correctly.
func TestTenantStore_Insert_PublicTenant(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	s := &store.TenantStore{DB: db}
	ts := time.Now().UnixNano()
	id := fmt.Sprintf("public-true-%d", ts)
	tenant := &store.Tenant{
		ID:             id,
		Subdomain:      fmt.Sprintf("test-public-%d", ts),
		DisplayName:    "Public Test",
		OwnerEmail:     uniqueEmail(t, "public-true"),
		ContainerImage: "picoclaw-launcher:latest",
		VolumePath:     "/tmp/t2",
		Status:         store.StatusProvisioning,
		IsPublic:       true,
	}
	if err := s.Insert(ctx, tenant); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if !got.IsPublic {
		t.Errorf("expected IsPublic=true, got false")
	}
}
