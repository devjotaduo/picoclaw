-- Supabase Auth integration for tenant dashboard logins.
--
-- supabase_user_id is the Supabase Auth UUID for the tenant's owner. Set when
--   auto-provision (or admin create) routes the owner through Supabase.
-- auth_backend selects how the controlplane authenticates dashboard requests
--   for this tenant: 'local' (existing users/sessions tables) or 'supabase'
--   (verify sb-access-token cookie via JWT). Legacy tenants stay 'local';
--   new auto-provisioned tenants default to 'supabase'.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS supabase_user_id UUID,
  ADD COLUMN IF NOT EXISTS auth_backend TEXT NOT NULL DEFAULT 'local';

-- Idempotent dedup: a Supabase user maps to at most one tenant.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_supabase_user_id_uidx
  ON tenants(supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

-- Speeds up the dedup-by-email lookup that auto-provision does before creating
-- a new tenant. Partial so it excludes soft-deleted rows.
CREATE INDEX IF NOT EXISTS tenants_owner_email_active_idx
  ON tenants(owner_email)
  WHERE deleted_at IS NULL;
