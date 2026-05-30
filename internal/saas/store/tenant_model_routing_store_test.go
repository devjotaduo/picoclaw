package store_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

func TestTenantModelRoutingStore_UpsertAndGet(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()

	tenants := &store.TenantStore{DB: db}
	if err := tenants.Insert(ctx, &store.Tenant{
		ID:             "routing-test-tenant",
		DisplayName:    "Routing Tenant",
		OwnerEmail:     "routing@example.com",
		Subdomain:      "routing-test",
		Status:         store.StatusActive,
		ContainerImage: "picoclaw-launcher:latest",
		VolumePath:     "/tmp/routing-test",
		MemLimitMB:     512,
		CPUQuota:       1,
		AuthBackend:    "launcher",
	}); err != nil {
		t.Fatal(err)
	}

	routingStore := &store.TenantModelRoutingStore{DB: db}
	want := &store.TenantModelRouting{
		TenantID:             "routing-test-tenant",
		Mode:                 "litellm",
		LiteLLMModelName:     "gpt-4o-mini",
		LiteLLMAPIBase:       "http://litellm:4000",
		LiteLLMFallbacks:     []string{"claude-haiku-4-5", "deepseek-chat"},
		LiteLLMAllowedModels: []string{"gpt-4o-mini", "claude-haiku-4-5", "deepseek-chat"},
		CLIOrder:             []string{"claude-cli", "codex-cli"},
	}
	if err := routingStore.Upsert(ctx, want); err != nil {
		t.Fatal(err)
	}

	got, err := routingStore.Get(ctx, "routing-test-tenant")
	if err != nil {
		t.Fatal(err)
	}
	if got.Mode != want.Mode ||
		got.LiteLLMModelName != want.LiteLLMModelName ||
		got.LiteLLMAPIBase != want.LiteLLMAPIBase ||
		!reflect.DeepEqual(got.LiteLLMFallbacks, want.LiteLLMFallbacks) ||
		!reflect.DeepEqual(got.LiteLLMAllowedModels, want.LiteLLMAllowedModels) ||
		!reflect.DeepEqual(got.CLIOrder, want.CLIOrder) {
		t.Fatalf("routing mismatch\ngot:  %+v\nwant: %+v", got, want)
	}
}
