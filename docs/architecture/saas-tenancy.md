# Picoclaw SaaS tenancy

Picoclaw SaaS keeps the runtime isolation model from Picoclaw standalone:
one tenant runs in one launcher container with one `$PICOCLAW_HOME` bind
mount. The SaaS control plane owns identity, RBAC, provisioning, LiteLLM
virtual keys, lifecycle actions, usage polling, CRM access, and the public
gateway.

## Public routing

- `admin.<base-domain>` serves the SaaS admin UI and `/api/v1/*`.
- `<tenant>.<base-domain>` is handled by the same SaaS process. It validates
  the session cookie, checks tenant membership, and reverse-proxies to
  `http://tenant-<tenant_id>:18800` on the internal Docker network.
- Tenant launcher containers are created with `traefik.enable=false`; they are
  not public entrypoints.
- The gateway signs every proxied request with
  `X-Picoclaw-Gateway-*` headers. Tenant launchers run with
  `PICOCLAW_AUTH_MODE=trusted_gateway` and reject protected requests without a
  valid HMAC signature.

## Roles

- `platform_admin`: full platform access, tenant lifecycle, CRM, users,
  invites, audit, budgets, agent and skills.
- `tenant_owner`: full access inside one tenant plus member/invite management.
- `tenant_admin`: tenant configuration, agent and skills management.
- `operator`: operational tenant access; read plus inbox/manual-action style
  routes through the tenant gateway.
- `viewer`: read-only tenant access.

The backend enforces roles before running handlers. The frontend only uses
`me.capabilities` and membership data to hide unavailable actions.

## Data model

The SaaS database keeps legacy `admins` for migration compatibility, but
runtime auth uses:

- `users`
- `tenant_memberships`
- `sessions`
- `invites`
- `audit_logs`

Migration `0005_identity_roles.sql` backfills existing `admins` into
`platform_admin` users and turns each `tenants.owner_email` into a
`tenant_owner` membership.

## Provisioning

Every tenant is seeded from a **Workspace** — a single, admin-managed
directory under `PICOCLAW_WORKSPACE_DIR` (default
`/srv/picoclaw-workspaces/<slug>/`). The workspace's `home/` subtree
becomes the tenant's `$PICOCLAW_HOME`; its `frontend-dist/` is
bind-mounted read-only into the container so each workspace can ship a
custom UI build.

`Provisioner.Create(CreateInput{WorkspaceID, ...})` is the only entry
point and runs five steps:

1. `mkdir` the per-tenant volume at `<TenantHostDataDir>/<id>/`.
2. `CopyWorkspaceHome` — drop the workspace's `home/` into the volume.
3. `SeedDashboardPassword` (skipped for Supabase / public tenants).
4. Generate a LiteLLM virtual key + `SubstituteConfigPlaceholders` —
   the workspace's `config.json` carries `${LITELLM_KEY}`,
   `${LITELLM_URL}`, `${TENANT_ID}` placeholders that get filled in.
5. `WriteLauncherPolicy` from the workspace's `role_policy_json` DB
   column.

The Docker container starts with two bind-mounts:

- `<volumePath>` → `/root/.picoclaw`
- `<workspace>/frontend-dist` → `/var/lib/picoclaw-frontend` (read-only,
  attached only when the operator has compiled the frontend at least
  once)

The container always runs `PICOCLAW_AUTH_MODE=trusted_gateway` so
proxied requests carrying the controlplane's HMAC headers are honored
and direct requests are rejected.

`CreateInput.WorkspaceID` is **required** — no fallback. Auto-provision
(Clara) calls `Workspaces.GetDefaultAuto(ctx)` and fails fast when no
workspace is marked `is_default_auto`.

Deep dive: [`workspaces.md`](workspaces.md).

