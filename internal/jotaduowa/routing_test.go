package jotaduowa

import (
	"context"
	"testing"
)

func TestRoutingRoundTrip(t *testing.T) {
	dir := t.TempDir()
	r, err := OpenRouting(dir)
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = r.Close() })

	ctx := context.Background()

	// Register two phones for tenant A and one for tenant B.
	for _, c := range []struct {
		phone, tenant string
	}{
		{"5511999998888", "tenant-a"},
		{"5511777776666@s.whatsapp.net", "tenant-a"},
		{"+5521555554444", "tenant-b"},
	} {
		if err := r.Register(ctx, c.phone, c.tenant); err != nil {
			t.Fatalf("Register(%s, %s): %v", c.phone, c.tenant, err)
		}
	}

	// Lookups normalize JID/+ prefixes to the same key.
	cases := []struct{ in, want string }{
		{"5511999998888", "tenant-a"},
		{"5511777776666", "tenant-a"},
		{"5511777776666@s.whatsapp.net", "tenant-a"},
		{"5511777776666:42@s.whatsapp.net", "tenant-a"},
		{"5521555554444", "tenant-b"},
		{"+5521555554444", "tenant-b"},
		{"5599998887777", ""}, // unmapped
	}
	for _, c := range cases {
		got, err := r.Lookup(ctx, c.in)
		if err != nil {
			t.Fatalf("Lookup(%s): %v", c.in, err)
		}
		if got != c.want {
			t.Errorf("Lookup(%s) = %q, want %q", c.in, got, c.want)
		}
	}

	// ListByTenant returns the two A routes.
	aRoutes, err := r.ListByTenant(ctx, "tenant-a")
	if err != nil {
		t.Fatalf("ListByTenant(a): %v", err)
	}
	if len(aRoutes) != 2 {
		t.Errorf("expected 2 routes for tenant-a, got %d", len(aRoutes))
	}

	// Revoke tenant-a clears both rows; tenant-b survives.
	n, err := r.RevokeByTenant(ctx, "tenant-a")
	if err != nil {
		t.Fatalf("RevokeByTenant(a): %v", err)
	}
	if n != 2 {
		t.Errorf("expected 2 rows removed, got %d", n)
	}
	if got, _ := r.Lookup(ctx, "5511999998888"); got != "" {
		t.Errorf("expected tenant-a route gone, got %q", got)
	}
	if got, _ := r.Lookup(ctx, "5521555554444"); got != "tenant-b" {
		t.Errorf("expected tenant-b route intact, got %q", got)
	}

	// Revoking an empty tenant is a no-op, not an error.
	n, err = r.RevokeByTenant(ctx, "tenant-c")
	if err != nil {
		t.Fatalf("RevokeByTenant(c): %v", err)
	}
	if n != 0 {
		t.Errorf("expected 0 rows removed for unknown tenant, got %d", n)
	}
}

func TestRoutingRegisterRebind(t *testing.T) {
	dir := t.TempDir()
	r, err := OpenRouting(dir)
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = r.Close() })
	ctx := context.Background()

	if err := r.Register(ctx, "5511111111111", "tenant-old"); err != nil {
		t.Fatalf("first register: %v", err)
	}
	if err := r.Register(ctx, "5511111111111", "tenant-new"); err != nil {
		t.Fatalf("rebind: %v", err)
	}
	got, err := r.Lookup(ctx, "5511111111111")
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if got != "tenant-new" {
		t.Errorf("rebind should win: got %q, want tenant-new", got)
	}
}

func TestRoutingLookupNormalizesLIDDeviceSuffix(t *testing.T) {
	dir := t.TempDir()
	r, err := OpenRouting(dir)
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = r.Close() })
	ctx := context.Background()

	if registerErr := r.Register(ctx, "39213068222606@lid", "tenant-public"); registerErr != nil {
		t.Fatalf("Register lid: %v", registerErr)
	}

	got, err := r.Lookup(ctx, "39213068222606:57@lid")
	if err != nil {
		t.Fatalf("Lookup lid with device suffix: %v", err)
	}
	if got != "tenant-public" {
		t.Fatalf("Lookup lid with device suffix = %q, want tenant-public", got)
	}
}
