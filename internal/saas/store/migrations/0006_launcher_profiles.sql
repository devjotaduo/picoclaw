CREATE TABLE IF NOT EXISTS launcher_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT NOT NULL DEFAULT 1,
    seed_path TEXT NOT NULL,
    role_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_launcher_profiles_one_default
    ON launcher_profiles (is_default)
    WHERE is_default;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS launcher_profile_id TEXT REFERENCES launcher_profiles(id) ON DELETE SET NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS launcher_profile_version_applied BIGINT;
