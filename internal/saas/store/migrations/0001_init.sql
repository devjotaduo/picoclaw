CREATE TABLE IF NOT EXISTS admins (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    bcrypt_hash TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login  TIMESTAMPTZ
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_status') THEN
        CREATE TYPE tenant_status AS ENUM (
            'provisioning',
            'active',
            'suspended',
            'deleting',
            'error'
        );
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS tenants (
    id                           TEXT PRIMARY KEY,
    display_name                 TEXT NOT NULL,
    owner_email                  TEXT NOT NULL,
    subdomain                    TEXT UNIQUE NOT NULL,
    status                       tenant_status NOT NULL DEFAULT 'provisioning',
    container_id                 TEXT,
    container_image              TEXT NOT NULL,
    volume_path                  TEXT NOT NULL,
    litellm_key_id               TEXT,
    litellm_key_hash             TEXT,
    monthly_budget_usd           NUMERIC(10,4),
    mem_limit_mb                 INT NOT NULL DEFAULT 512,
    cpu_quota                    NUMERIC(4,2) NOT NULL DEFAULT 0.5,
    initial_password_delivered   BOOLEAN NOT NULL DEFAULT FALSE,
    last_error                   TEXT,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    suspended_at                 TIMESTAMPTZ,
    deleted_at                   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted ON tenants(deleted_at);
