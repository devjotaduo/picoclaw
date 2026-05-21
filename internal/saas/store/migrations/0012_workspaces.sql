-- workspaces: single source of truth for tenant content, replacing the
-- three-overlay pile (TenantTemplateDir + launcher_profiles + AutoProvisionWorkspaceDir).
--
-- A workspace lives at <host_path> on the host filesystem and contains:
--   home/         → bind-mounted into the tenant container at /root/.picoclaw
--   frontend-src/ → editable React source (admin-edited via dashboard)
--   frontend-dist/→ compiled vite output, bind-mounted read-only into the tenant
--
-- The legacy launcher_profiles table is intentionally NOT dropped here so the
-- Go backfill (in internal/saas/store/migrate.go) can copy profile seeds into
-- workspaces before 0013 retires the old table.

CREATE TABLE IF NOT EXISTS workspaces (
    id                   TEXT        PRIMARY KEY,
    name                 TEXT        NOT NULL,
    slug                 TEXT        NOT NULL UNIQUE,
    description          TEXT        NOT NULL DEFAULT '',
    host_path            TEXT        NOT NULL,
    is_default_auto      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_available_manual  BOOLEAN     NOT NULL DEFAULT TRUE,
    role_policy_json     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    frontend_built_at    TIMESTAMPTZ,
    frontend_build_log   TEXT        NOT NULL DEFAULT '',
    version              BIGINT      NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one workspace can be marked as the default for auto-provisioning. The
-- partial unique index makes the constraint enforced by the DB rather than a
-- transaction in app code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_one_default_auto
    ON workspaces (is_default_auto)
    WHERE is_default_auto;

-- tenants.workspace_id points at the workspace used at provisioning time. The
-- launcher_profile_id columns stay around until 0013 so the Go backfill can
-- migrate without a hard cutover.
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS workspace_version_applied BIGINT;
