package store_test

import (
	"context"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

func TestPlatformSettingsStore_UpsertAndGet(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	settings := &store.PlatformSettingsStore{DB: db}

	if err := settings.Upsert(ctx, store.PlatformSettingLiteLLMURL, "http://litellm:4000", false); err != nil {
		t.Fatal(err)
	}
	got, err := settings.Get(ctx, store.PlatformSettingLiteLLMURL)
	if err != nil {
		t.Fatal(err)
	}
	if got.Value != "http://litellm:4000" || got.Encrypted {
		t.Fatalf("unexpected setting: %+v", got)
	}

	if upsertErr := settings.Upsert(
		ctx,
		store.PlatformSettingLiteLLMMasterKey,
		"ciphertext",
		true,
	); upsertErr != nil {
		t.Fatal(upsertErr)
	}
	secret, err := settings.Get(ctx, store.PlatformSettingLiteLLMMasterKey)
	if err != nil {
		t.Fatal(err)
	}
	if secret.Value != "ciphertext" || !secret.Encrypted {
		t.Fatalf("unexpected secret setting: %+v", secret)
	}
}
