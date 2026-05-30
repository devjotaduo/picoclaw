-- Platform-level settings and per-tenant model routing.
--
-- platform_settings stores operator-managed control-plane configuration.
-- Secret values are encrypted by the API layer before insert.
CREATE TABLE IF NOT EXISTS platform_settings (
    key        TEXT        PRIMARY KEY,
    value      TEXT        NOT NULL DEFAULT '',
    encrypted  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenant_model_routing is the SaaS source of truth for model auth/routing.
-- The tenant volume still gets materialized config.json, but this table lets
-- the panel re-open and re-apply the selected routing later.
CREATE TABLE IF NOT EXISTS tenant_model_routing (
    tenant_id               TEXT        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    mode                    TEXT        NOT NULL DEFAULT 'auto'
                                      CHECK (mode IN ('auto', 'litellm', 'cli')),
    litellm_model_name      TEXT        NOT NULL DEFAULT '',
    litellm_api_base        TEXT        NOT NULL DEFAULT '',
    litellm_fallbacks       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    litellm_allowed_models  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    cli_order               JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_model_routing_tenant
    ON tenant_model_routing(tenant_id);
