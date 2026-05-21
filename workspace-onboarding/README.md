# workspace-onboarding

Workspace template overlay for the **public onboarding tenant**
(`is_public=true`). Provisioned by `scripts/provision-onboarding-tenant.sh`.

## What's here

- `agents/clara/` — Clara, the public-facing onboarding agent. Ported from
  `internal/saas/clara/clara_system.txt`.
- `config.json` — picoclaw config with the `public-web` channel enabled.
- `skills/onboarding-mark-qualified/` — HMAC-signed callback skill that
  marks the intake as qualified on the controlplane.
- `skills/onboarding-submit-intake/` — HMAC-signed callback skill that
  submits the finalized intake and triggers `AutoProvisioner.Run`.

## When this overlays

`provision-onboarding-tenant.sh` calls
`POST /api/v1/tenants/onboarding/bootstrap`, which creates a tenant with
`IsPublic=true` and overlays this directory into the tenant's
`$PICOCLAW_HOME/workspace/`.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 4 — `pkg/channels/publicweb/` channel | ✅ in this PR |
| 5 — launcher endpoints (`/api/public/chat`, `/stream`, `/health`) | ✅ in this PR |
| 6 — skill scripts (HMAC callback bash) | ✅ in this PR |
| 7 — controlplane callback endpoint | ✅ in this PR |
| 10 — frontend cutover (`VITE_USE_ONBOARDING_TENANT`) | 🚧 stub — real cutover needs an SSE event-shape adapter (see `useClaraChat.ts` TODO) |

## What works after bootstrap

- Container subiu com canal `public-web` ativo.
- POST `/api/public/chat` aceita mensagens anônimas com `{session_id, message}` (202).
- GET `/api/public/chat/stream?session_id=…` entrega a resposta do agente via SSE.
- Clara invoca os skills `onboarding-mark-qualified` / `onboarding-submit-intake`,
  que postam HMAC-assinados ao controlplane → `MarkQualifiedByID` /
  `AutoProvisioner.Run`.

## Required env on the onboarding tenant container

The skill scripts read these — the provisioner needs to thread them into the
container env at boot. Documented as a follow-up in
`docs/architecture/public-onboarding-tenant.md`:

```
PICOCLAW_ONBOARDING_CALLBACK_URL=https://adm.jotaduo.com
PICOCLAW_ONBOARDING_CALLBACK_SECRET=<hex-32-bytes, same as controlplane>
```

## What still requires work to go live in prod

- Provisioner `buildSpec` must inject the two env vars above (~10 lines TODO).
- Frontend cutover (Phase 10) — the chat at `adm.<base>/pre-cadastro` still
  hits the legacy `/api/v1/public/company-intakes/{id}/chat` handler in the
  controlplane. Flipping `VITE_USE_ONBOARDING_TENANT=true` requires an SSE
  event-shape adapter or richer events emitted by `publicweb.Channel.Send`.
- Captcha verification on `RequireCaptchaHeader` (Cloudflare Turnstile or
  similar — the channel only checks header presence, not validity).
