-- Retire the launcher_profile system entirely now that workspaces are the
-- single source of truth for tenant content. The previous migration (0012)
-- introduced the workspaces table and added tenants.workspace_id alongside
-- the legacy tenants.launcher_profile_id columns; the Go backfill that
-- copied each profile seed into a workspace ran once. After at least one
-- full boot of that backfill (verified by operator), this migration drops:
--
--   1. tenants.launcher_profile_id        — no longer referenced by Go
--   2. tenants.launcher_profile_version_applied
--   3. The launcher_profiles table itself
--
-- The migration is destructive but safe-to-rerun (DROP ... IF EXISTS). A
-- rollback requires restoring from a Postgres backup; we no longer maintain
-- code paths that would re-populate the dropped columns.

ALTER TABLE tenants DROP COLUMN IF EXISTS launcher_profile_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS launcher_profile_version_applied;

DROP TABLE IF EXISTS launcher_profiles;
