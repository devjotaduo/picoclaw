CREATE TABLE IF NOT EXISTS usage_logs (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    ts                TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    prompt_tokens     INT NOT NULL,
    completion_tokens INT NOT NULL,
    cost_usd          NUMERIC(10,6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_ts ON usage_logs(tenant_id, ts DESC);
