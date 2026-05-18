-- Per-tenant configuration captured from SKILL.md metadata.integration schemas.
-- Plain values and encrypted secrets are split so API responses can redact
-- secrets without losing their configured state.

CREATE TABLE IF NOT EXISTS tenant_skill_integrations (
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    skill_name   TEXT NOT NULL CHECK (skill_name ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    values_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
    secrets_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_skill_integrations_tenant
    ON tenant_skill_integrations (tenant_id);
