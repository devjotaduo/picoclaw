ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cleanup_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_deleting
    ON tenants(status, cleanup_completed_at)
    WHERE status = 'deleting' AND cleanup_completed_at IS NULL;
