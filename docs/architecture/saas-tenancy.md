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

Tenant creation copies the configured template directory, skips runtime state,
creates a LiteLLM virtual key, writes the plaintext key only to the tenant
volume, merges Picoclaw `config.json` so the default model uses LiteLLM, and
starts an internal launcher container in trusted gateway mode.

