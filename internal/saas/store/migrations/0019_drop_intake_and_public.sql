-- Drop everything the Clara pre-cadastro / public-onboarding flow added:
--   * company_intakes + chat history (migrations 0007, 0008)
--   * intake_reminders queue (0010)
--   * tenants.is_public column + partial index (0011)
--   * workspaces.is_default_auto column + partial index (0012, partial)
--
-- This is a forward-only deletion. Tables and columns are gone after running.
-- If you rolled back to a pre-removal commit you'd recreate them from
-- 0007/0008/0010/0011/0012; we don't keep the originals around because the
-- public onboarding feature has been removed entirely.

DROP TABLE IF EXISTS company_intakes_chat;
DROP TABLE IF EXISTS intake_reminders;
DROP TABLE IF EXISTS company_intakes;

DROP INDEX IF EXISTS tenants_is_public_idx;
ALTER TABLE tenants DROP COLUMN IF EXISTS is_public;

DROP INDEX IF EXISTS workspaces_is_default_auto_idx;
ALTER TABLE workspaces DROP COLUMN IF EXISTS is_default_auto;
