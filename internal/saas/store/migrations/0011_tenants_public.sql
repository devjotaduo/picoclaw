ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Indexed because the tenant gateway hot path looks it up per request
-- (subdomain → tenant row → check is_public).
CREATE INDEX IF NOT EXISTS tenants_is_public_idx ON tenants(is_public)
  WHERE is_public = true;

COMMENT ON COLUMN tenants.is_public IS
  'When true, tenant launcher accepts the minimal anonymous tenant-root Sofia chat surface without Supabase JWT.';
