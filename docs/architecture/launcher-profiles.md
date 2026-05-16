# Launcher Profiles

Launcher profiles define the reusable base `$PICOCLAW_HOME` that the SaaS controlplane gives to tenant launcher containers.

## Business Rule

- The official management surface is the integrated SaaS admin at `adm.jotaduo.com`.
- A profile affects new tenants automatically only when selected during tenant creation or when it is the default profile.
- Existing tenants are never changed implicitly. They receive profile updates only through the explicit `Apply profile` action.
- Applying a profile is a managed merge, not a raw volume replacement.

## Stored Data

Postgres stores profile metadata in `launcher_profiles`:

- `id`, `name`, `slug`, `description`
- `is_default`, `version`
- `seed_path`
- `role_policy_json`

Tenant rows store:

- `launcher_profile_id`
- `launcher_profile_version_applied`

Seed directories live under `TENANT_PROFILE_DIR`, defaulting to `/var/lib/picoclaw-saas/launcher-profiles`.

## Seed Contents

Allowed seed files include:

- `config.json`
- `.security.yml`
- `workspace/AGENT.md`
- `workspace/SOUL.md`
- `workspace/behavior.json`
- workspace skills/tools and other non-runtime files

Skipped or preserved live state includes:

- `launcher-auth.db`, `dashboardauth.db`, and other `*.db`
- `*.key`, including tenant `litellm.key`
- `auth.json`
- sessions, memory, logs, PID/socket files
- WhatsApp, Matrix, and channel runtime state
- `runtime-user-env`

`SeedPicoConfig` still writes a tenant-specific LiteLLM key after the profile seed is copied.

## Skill Policy

Launcher profiles should curate skills by audience instead of copying every installed capability into every tenant.

- Standard business profiles should include only tenant-facing skills for atendimento, clínica, loja, vendas, suporte, internal/compliance, privacy, and routing.
- `memory-and-knowledge-check` is an optional audit skill for high-risk factual responses, not a default always-on template skill.
- Dev/operator profiles may include technical skills such as `agent-browser`, `github`, `hardware`, `skill-creator`, `summarize`, `tmux`, and `weather`.
- Template defaults must recommend only skills present in the profile seed. The launcher backend rejects enabled unknown skills and discards disabled unknown entries before writing runtime files.

## Role Policy

Role policy uses stable feature IDs:

`chat`, `models`, `credentials`, `channels`, `agent_editor`, `agent_templates`, `skills`, `tools`, `config`, `raw_config`, `logs`, `whatsapp_inbox`.

Access levels are `none`, `read`, and `write`.

The SaaS gateway enforces this policy before proxying to `tenant-<id>:18800`. The launcher enforces it again after validating trusted gateway headers. The frontend only uses `/api/launcher/policy` to hide sidebar items and guide the UI.
