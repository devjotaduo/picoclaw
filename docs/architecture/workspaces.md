# Workspaces

A **workspace** is the single source of truth for tenant content in the SaaS
control plane. One workspace = one selectable template that drives:

- `home/` — bind-mounted into the tenant container at `/root/.picoclaw`, so
  it provides the entire `$PICOCLAW_HOME` (config.json, .security.yml,
  workspace/AGENT.md, agents, skills, etc).
- `frontend-src/` — editable React source the admin operator tweaks per
  workspace.
- `frontend-dist/` — compiled vite output, bind-mounted read-only into the
  tenant at `/var/lib/picoclaw-frontend` so the launcher serves a
  per-workspace custom UI without needing a separate Docker image.

This collapses what used to be three overlapping concepts
(`TenantTemplateDir`, `LauncherProfile.SeedPath`, `AutoProvisionWorkspaceDir`)
into one. See [`saas-tenancy.md`](saas-tenancy.md) for the broader provisioning
flow.

---

## On-disk layout

Every workspace lives under `Cfg.WorkspaceDir` (env `PICOCLAW_WORKSPACE_DIR`,
default `/srv/picoclaw-workspaces`):

```
/srv/picoclaw-workspaces/<slug>/
├── home/                          # bind-mounted to /root/.picoclaw
│   ├── config.json                # contains "${LITELLM_KEY}" placeholder
│   ├── .security.yml
│   ├── auth.json                  # OPTIONAL channel credentials
│   └── workspace/
│       ├── AGENT.md
│       ├── SOUL.md
│       ├── behavior.json
│       ├── agents/<name>/
│       ├── skills/<name>/
│       ├── config/<topic>.md
│       └── memory/<seed>.md
├── frontend-src/                  # admin-edited React source (NOT mounted)
│   ├── package.json
│   ├── src/
│   └── vite.config.ts
└── frontend-dist/                 # vite build output, read-only bind-mount
    ├── index.html
    └── assets/
```

The same shape is created automatically by `POST /api/v1/workspaces`. The
operator may also populate it via SSH on the host — the dashboard CRUD and
the on-disk tree are kept in sync (no manifest file, no extra metadata).

---

## Required files in `home/`

| File | Required | Purpose |
|---|---|---|
| `config.json` | yes | `model_list` (with `${LITELLM_KEY}` placeholder), `channels`, `agents.defaults`, `gateway`, `hooks`. The substitution happens at provisioning time. |
| `.security.yml` | yes | Permission rules (per-action allow/deny) the launcher enforces against the agent. |
| `workspace/AGENT.md` | yes | Main agent prompt + frontmatter (model, enabled skills, tool allowlists). |
| `workspace/SOUL.md` | recommended | Identity, voice, language. |
| `workspace/behavior.json` | recommended | Hard business switches (master_enabled, group_mention_only, business hours). |
| `workspace/agents/<name>/` | optional | Sibling agents (each with their own AGENT.md/SOUL.md/behavior.json). |
| `workspace/skills/<name>/` | optional | Skills (SKILL.md + scripts). |
| `workspace/config/<topic>.md` | optional | Initial knowledge base for the agent. |
| `workspace/memory/<seed>.md` | optional | Seed memory files. |
| `auth.json` | optional | Pre-baked channel credentials (rare). |

**Never** in a workspace (the provisioner generates these per tenant):

- `dashboardauth.db` (bcrypt hash of the dashboard password — written by
  `SeedDashboardPassword`; skipped for Supabase-auth tenants).
- `launcher_policy.json` (RBAC — derived from the workspace's
  `role_policy_json` DB column at provisioning time).
- `workspace/sessions/`, `workspace/whatsapp/`, `workspace/matrix/`,
  `state/`, `runtime-user-env/` — runtime state created on first contact.

The `home/config.json` placeholder substitution covers
`${LITELLM_KEY}`, `${LITELLM_URL}`, `${TENANT_ID}`.

---

## Data model

```sql
CREATE TABLE workspaces (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    slug                 TEXT NOT NULL UNIQUE,
    description          TEXT NOT NULL DEFAULT '',
    host_path            TEXT NOT NULL,
    is_default_auto      BOOLEAN NOT NULL DEFAULT FALSE,
    is_available_manual  BOOLEAN NOT NULL DEFAULT TRUE,
    role_policy_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    frontend_built_at    TIMESTAMPTZ,
    frontend_build_log   TEXT NOT NULL DEFAULT '',
    version              BIGINT NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_workspaces_one_default_auto
    ON workspaces (is_default_auto) WHERE is_default_auto;

ALTER TABLE tenants
    ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT,
    ADD COLUMN workspace_version_applied BIGINT;
```

Migration `0012_workspaces.sql` introduced the table. Migration
`0013_drop_launcher_profiles.sql` retired the legacy `launcher_profiles`
table plus the `tenants.launcher_profile_id` columns.

Two boolean flags on each workspace:

- **`is_default_auto`** — at most one workspace is the auto-provision
  default. Clara's `AutoProvisioner.Run` picks this one when qualifying a
  visitor. Marking another flips it (DB constraint enforces the uniqueness).
- **`is_available_manual`** — appears in the admin "Create tenant" dropdown.
  Set to false for workspaces used only by automation or kept as drafts.

`tenants.workspace_id` is FK with `ON DELETE RESTRICT` so admin can't drop a
workspace that has running tenants attached.

---

## Provisioning flow (the only path)

`Provisioner.Create(CreateInput{WorkspaceID, ...})` runs five steps:

1. **mkdir** the tenant volume at `<TenantHostDataDir>/<tenant-id>/`.
2. **`CopyWorkspaceHome`** — single authoritative copy of
   `<workspace>/home/` into the tenant volume. No skip list (the workspace
   is curated; if a runtime-state file leaked in, that's an operator
   error caught by the dashboard's file editor).
3. **`SeedDashboardPassword`** (skipped for Supabase / public tenants).
4. **LiteLLM** key generation + **`SubstituteConfigPlaceholders`**:
   - Generates a per-tenant LiteLLM virtual key.
   - Walks `home/config.json`, `home/.security.yml`,
     `workspace/behavior.json`, `workspace/agent_config.json` and
     replaces `${LITELLM_KEY}`, `${LITELLM_URL}`, `${TENANT_ID}` with the
     real values.
   - Files outside this fixed list are NEVER scanned — keeps binary
     workspace assets safe from accidental byte substitution.
5. **`WriteLauncherPolicy`** — writes `launcher_policy.json` from the
   workspace's `role_policy_json` DB column.
6. **`buildSpec`** — Docker container with two bind-mounts:
   - `<volumePath>` → `/root/.picoclaw`
   - `<workspace>/frontend-dist` → `/var/lib/picoclaw-frontend` (read-only,
     only when `HasBuiltFrontend(hostPath)` is true)
   - `PICOCLAW_FRONTEND_DIST_DIR=/var/lib/picoclaw-frontend` env var is
     also injected; the launcher's `web/backend/embed.go` honors it and
     serves from the bind-mount instead of the embedded fallback.

`buildSpec` re-attaches the frontend bind on every `Recreate` /
`lifecycle.Restart` so the visual customization survives container
recreation without re-running the full provisioning flow.

`CreateInput.WorkspaceID` is **required** — the provisioner short-circuits
with a clear error otherwise.

---

## Auto-provision (Clara)

`internal/saas/api/company_intakes_provision.go`:

```go
ws, _ := a.Workspaces.GetDefaultAuto(ctx)
out, _ := a.Provisioner.Create(ctx, tenant.CreateInput{
    WorkspaceID: ws.ID,
    ... // contact, supabase, etc.
})
```

If no workspace is marked `is_default_auto`, auto-provision fails fast and
the operator sees the error in the Clara chat. No legacy fallback.

---

## Clone tenant

`Provisioner.CloneFromTenant`:

1. `CopyVolumeRaw(src.VolumePath, t.VolumePath)` — verbatim byte copy of
   the source tenant's volume (skipping PID/sock/lock/WAL files only —
   see `template.go:rawCloneSkipExact`).
2. If `src.WorkspaceID` is set, re-derive `launcher_policy.json` from the
   workspace's current RBAC policy (the raw copy pulled an older version
   if the source had local edits).
3. Generate a fresh LiteLLM key + `RewriteConfigLiteLLMKey(volumePath,
   newKey)` — parses the cloned `config.json` and replaces every
   `model_list[].api_key` (and `litellm_params.api_key`) with the new
   key. Prevents the clone from burning the source's budget.
4. Container start with the source's workspace bind-mount (inherited via
   `t.WorkspaceID = src.WorkspaceID`).

The clone preserves runtime state intentionally (sessions, memory,
whatsapp pairing) — that's the whole point. The new tenant ID + LiteLLM
key + cleaned policy file are the only differences from a byte-for-byte
duplicate.

---

## Onboarding tenant (`is_public=true`)

Provisioned via `POST /api/v1/tenants/onboarding/bootstrap` (script:
`scripts/provision-onboarding-tenant.sh`). The body accepts
`workspace_id` to pick a specific workspace; when empty, it looks up the
workspace whose slug is `"onboarding"`. Operator's expected flow:

1. Admin > Workspaces > New, slug `onboarding`. Edit
   `home/workspace/AGENT.md` to taste (or import the
   `workspace-onboarding/` directory in the repo via
   "Importar do $PICOCLAW_HOME").
2. POST `/api/v1/tenants/onboarding/bootstrap` (or run the bootstrap
   script).
3. Set `PICOCLAW_ONBOARDING_CALLBACK_SECRET` on the controlplane.
   The bootstrap response returns a `warning` field when this is unset
   so the misconfig is loud.

See [`public-onboarding-tenant.md`](public-onboarding-tenant.md) for the
visitor flow, public-web channel internals, and Turnstile gating.

---

## Frontend build (per-workspace custom UI)

The admin clicks "Compilar frontend" on the Workspaces page →
`POST /api/v1/workspaces/{id}/frontend/build` →
`tenant.BuildWorkspaceFrontend(ctx, hostPath)`:

1. Per-workspace lock prevents concurrent builds on the same dir.
2. Spawns `docker run --rm node:24-alpine3.23` with two bind-mounts
   (`frontend-src/` → `/src`, `frontend-dist/` → `/out`).
3. Runs `corepack enable && pnpm install --frozen-lockfile && pnpm vite
   build --outDir /out --emptyOutDir`.
4. Captures combined stdout+stderr (tail-capped at 64 KiB), stores in
   `workspaces.frontend_build_log`.
5. Sets `workspaces.frontend_built_at = now()`.
6. 5-minute hard timeout; failure surfaces in the build log shown in the
   admin UI.

The launcher's embed.go honors `PICOCLAW_FRONTEND_DIST_DIR` when set
and the directory has a non-empty `index.html` — falls back gracefully
to the embedded dist when the bind-mount is empty (workspace created but
operator never clicked compile).

---

## HTTP endpoints (controlplane)

All gated by `requirePlatformAdmin`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/workspaces` | List workspaces (`?manual_only=true` filters) |
| POST | `/api/v1/workspaces` | Create workspace + pre-create `home/`, `frontend-src/`, `frontend-dist/` |
| POST | `/api/v1/workspaces/import-from-home` | Bootstrap from an existing `$PICOCLAW_HOME` directory on the host (sanitizes runtime/secret files) |
| GET | `/api/v1/workspaces/{id}` | Detail |
| PUT | `/api/v1/workspaces/{id}` | Update metadata + flags + role policy |
| DELETE | `/api/v1/workspaces/{id}` | Delete row (on-disk tree preserved; FK blocks delete when tenants reference it) |
| GET | `/api/v1/workspaces/{id}/files?path=...` | Read text file inside `home/`, `frontend-src/`, or `frontend-dist/` |
| PUT | `/api/v1/workspaces/{id}/files` | Write text file (path-safety enforced — no `..`, absolute paths, or symlinks) |
| POST | `/api/v1/workspaces/{id}/frontend/build` | Synchronous vite build via node sidecar |

`tenants` payload accepts `workspace_id` in `POST /api/v1/tenants` (required).

---

## Admin UI

Single page `/workspaces` in `web/saas-admin/` (`src/pages/Workspaces.tsx`):

- Left sidebar: workspace list with version + flags (`auto`, `oculto`).
- Right: three cards per workspace:
  - **Metadados** — name, slug, description, switches for
    `is_default_auto` / `is_available_manual`, Save / Delete.
  - **Frontend** — last-build timestamp, "Compilar frontend" button,
    log tail in the response drawer.
  - **Arquivos** — chips for common files (`home/config.json`,
    `.security.yml`, `workspace/AGENT.md`, `SOUL.md`, `behavior.json`),
    arbitrary path input + monospace textarea. Save / Load.

The "New tenant" form (`src/pages/NewTenant.tsx`) shows a required
workspace dropdown — when zero workspaces exist, it shows an amber
banner linking to `/workspaces` instead of a fallback.

`/tenants/{id}` (TenantDetail) shows the bound workspace as a small card
linking back to `/workspaces`.

---

## Configuration

| Env | Default | Purpose |
|---|---|---|
| `PICOCLAW_WORKSPACE_DIR` | `/srv/picoclaw-workspaces` | Host root for workspaces |

Retired (do not set; the loader no longer reads them):
`TENANT_TEMPLATE_DIR`, `TENANT_PROFILE_DIR`,
`PICOCLAW_SAAS_AUTO_PROVISION_PROFILE`,
`PICOCLAW_SAAS_AUTO_PROVISION_WORKSPACE_DIR`.

The `docker/saas/docker-compose.yml` bind-mounts the host workspace
directory into the controlplane (read-write) and into the build sidecar.

---

## File-safety contract

`resolveWorkspaceFile(hostPath, rel)` (in
`internal/saas/api/workspaces.go`) is the path-safety chokepoint for the
file CRUD endpoint. It rejects:

- empty paths
- absolute paths (`/etc/...`)
- `..` segments (`home/../etc/passwd`)
- anything outside `home/`, `frontend-src/`, `frontend-dist/`
- resolved paths that escape the workspace root after absolute-path
  normalization (defense in depth)

A regression here would turn the file PUT endpoint into an arbitrary-write
primitive. Tests in `internal/saas/api/workspaces_test.go` cover 11
attack patterns.

---

## What changed from the launcher-profile era

| Concept | Then | Now |
|---|---|---|
| Tenant content source | `TenantTemplateDir` (raw copy) + `LauncherProfile.SeedPath` (overlay) + `AutoProvisionWorkspaceDir` (extra overlay for auto-provision) | One `Workspace.home/` directory |
| Provisioning steps | 7 functions (`CopyVolumeRaw`, `ApplyProfileSeed`, `WriteLauncherPolicy`, `SeedDashboardPassword`, LiteLLM, `SeedPicoConfig`, `EnsureTenantWhatsAppNativeConfig`) plus `OverlayWorkspace` for auto-provision | 5 functions (mkdir, `CopyWorkspaceHome`, optional `SeedDashboardPassword`, LiteLLM + `SubstituteConfigPlaceholders`, `WriteLauncherPolicy`) |
| Frontend per tenant | Single embedded dist baked into `picoclaw-launcher:latest` | Optional per-workspace custom build, bind-mounted; falls back to embed when not compiled |
| Admin UI | `/launcher-profiles` with seed file manifest (`.saas-seed-files.json`), `exact` vs `templated` distinction | `/workspaces` with plain file editor; no manifest, no exact/templated split |
| Selecting auto template | `PICOCLAW_SAAS_AUTO_PROVISION_PROFILE` env var | `is_default_auto` DB flag on a workspace |
| LiteLLM key in config | `SeedPicoConfig` wrote config.json from scratch | `home/config.json` carries `${LITELLM_KEY}` placeholder; substituted at provision time |

The legacy `EnsureTenantWhatsAppNativeConfig` and `SeedPicoConfig`
guard/seed functions are gone — the operator now owns `config.json`
inside the workspace; any channel restriction or model default is
expressed there.
