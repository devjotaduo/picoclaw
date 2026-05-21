# workspace-onboarding

Reference content for the **public onboarding tenant** (`is_public=true`).
The operator creates a Workspace from this directory (slug `onboarding`)
via `adm.<base>/workspaces` and then runs
`scripts/provision-onboarding-tenant.sh` to provision the tenant.

## What's here

- `agents/clara/` — Clara, the public-facing onboarding agent. Ported
  from the legacy `internal/saas/clara/clara_system.txt`.
- `config.json` — picoclaw config with the `public-web` channel enabled
  (carries the `${LITELLM_KEY}` placeholder).
- `skills/onboarding-mark-qualified/` — HMAC-signed callback skill that
  marks the intake as qualified on the controlplane.
- `skills/onboarding-submit-intake/` — HMAC-signed callback skill that
  submits the finalized intake and triggers `AutoProvisioner.Run`.

## How to install (one-time per environment)

1. Copy the directory contents into a workspace `home/` subtree on the
   host:
   ```bash
   ssh root@vps.jotaduo.com 'install -d /srv/picoclaw-workspaces/onboarding/home/workspace'
   scp -r workspace-onboarding/agents workspace-onboarding/skills \
       root@vps.jotaduo.com:/srv/picoclaw-workspaces/onboarding/home/workspace/
   scp workspace-onboarding/config.json \
       root@vps.jotaduo.com:/srv/picoclaw-workspaces/onboarding/home/
   ```

2. Insert the DB row via the admin UI (`/workspaces` → "Importar do
   $PICOCLAW_HOME" with `source_path=/srv/picoclaw-workspaces/onboarding/home`)
   OR `POST /api/v1/workspaces` with body
   `{"name":"Onboarding","slug":"onboarding","is_available_manual":false}`.

3. Optionally compile a per-workspace frontend variant (the embedded
   launcher dist is the default fallback).

4. Run the bootstrap (resolves workspace by slug `onboarding`):
   ```bash
   ./scripts/provision-onboarding-tenant.sh
   ```

## How this consumes the workspace

`POST /api/v1/tenants/onboarding/bootstrap` resolves the workspace by
slug (default `onboarding`, override with `workspace_id` in the body)
and calls `Provisioner.Create` with `IsPublic=true`. The standard
provisioning flow takes over from there — see
[`docs/architecture/workspaces.md`](../docs/architecture/workspaces.md).

## What works after bootstrap

- Container running with channel `public-web` active.
- POST `/api/public/chat` accepts anonymous messages with
  `{session_id, message}` → 202.
- GET `/api/public/chat/stream?session_id=…` delivers agent replies via
  SSE.
- Clara invokes skills `onboarding-mark-qualified` and
  `onboarding-submit-intake`, which HMAC-POST to the controlplane →
  `MarkQualifiedByID` / `AutoProvisioner.Run`.

## Required env on the controlplane

The provisioner already threads these into every `IsPublic=true` tenant
container automatically (see `internal/saas/tenant/provisioner.go`
`buildSpec`). Set them on the **controlplane host** so the provisioner
has something to inject:

```
PICOCLAW_ONBOARDING_CALLBACK_URL=https://adm.<base>
PICOCLAW_ONBOARDING_CALLBACK_SECRET=<hex-32-bytes>
```

Without the secret the skill scripts inside the tenant container exit
non-zero and Clara has to apologize to the visitor instead of returning
the panel URL.

## Open items

- **Frontend cutover (Phase 10)** — the chat at `<base>/pre-cadastro`
  still hits the legacy `/api/v1/public/company-intakes/{id}/chat`
  handler. Flipping `VITE_USE_ONBOARDING_TENANT=true` requires an SSE
  event-shape adapter in `useClaraChat.ts`. TODO marker lives at
  `web/saas-admin/src/pages/pre-cadastro/clara/useClaraChat.ts`.
- **Cloudflare Turnstile widget** on the frontend — server-side verify
  is already in place (`internal/saas/api/turnstile.go`, opt-in via
  `TURNSTILE_SECRET_KEY`). Until the React widget ships, keep the secret
  unset or every POST will 403.
