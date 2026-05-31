-- Allow SaaS admin to pick the concrete Claude/Codex CLI models per tenant.
-- Empty values preserve the existing defaults:
--   claude-cli -> model_name=claude-cli-sonnet, model=sonnet
--   codex-cli  -> model_name=codex-cli-gpt-5, model=codex-cli
ALTER TABLE tenant_model_routing
    ADD COLUMN IF NOT EXISTS cli_claude_model_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS cli_claude_model      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS cli_codex_model_name  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS cli_codex_model       TEXT NOT NULL DEFAULT '';
