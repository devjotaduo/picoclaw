-- workspaces.is_raw: when true, the provisioner copies the workspace's home/
-- contents into the tenant volume verbatim and SKIPS every transformation step
-- it normally runs:
--   - SeedDashboardPassword (the launcher-auth.db from home/ is reused as-is)
--   - LiteLLM.GenerateKey + SubstituteConfigPlaceholders
--     (no ${LITELLM_KEY}/${LITELLM_URL}/${TENANT_ID} rewrite in config.json)
--   - WriteLauncherPolicy (the launcher_policy.json from home/ is reused as-is)
--
-- Intended for operators who upload a complete tenant volume zip and want the
-- container to boot against the exact bytes they shipped — no LiteLLM proxy,
-- no key rotation, no policy override. They're responsible for whatever auth /
-- model setup is baked into the zip.
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS is_raw BOOLEAN NOT NULL DEFAULT FALSE;
