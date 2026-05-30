package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	PlatformSettingLiteLLMURL       = "litellm.url"
	PlatformSettingLiteLLMMasterKey = "litellm.master_key"
)

var ErrPlatformSettingNotFound = errors.New("platform setting not found")

type PlatformSetting struct {
	Key       string
	Value     string
	Encrypted bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type PlatformSettingsStore struct{ DB *DB }

func (s *PlatformSettingsStore) Upsert(ctx context.Context, key, value string, encrypted bool) error {
	const q = `
        INSERT INTO platform_settings (key, value, encrypted, created_at, updated_at)
        VALUES ($1, $2, $3, now(), now())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            encrypted = EXCLUDED.encrypted,
            updated_at = now()`
	_, err := s.DB.Pool.Exec(ctx, q, key, value, encrypted)
	return err
}

func (s *PlatformSettingsStore) Get(ctx context.Context, key string) (*PlatformSetting, error) {
	const q = `SELECT key, value, encrypted, created_at, updated_at FROM platform_settings WHERE key = $1`
	var out PlatformSetting
	if err := s.DB.Pool.QueryRow(ctx, q, key).Scan(
		&out.Key, &out.Value, &out.Encrypted, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPlatformSettingNotFound
		}
		return nil, err
	}
	return &out, nil
}

func (s *PlatformSettingsStore) GetOptional(ctx context.Context, key string) (*PlatformSetting, error) {
	out, err := s.Get(ctx, key)
	if errors.Is(err, ErrPlatformSettingNotFound) {
		return nil, nil
	}
	return out, err
}
