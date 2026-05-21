# workspace-onboarding

Workspace template overlay for the **public onboarding tenant**
(`is_public=true`). Provisioned by `scripts/provision-onboarding-tenant.sh`.

## What's here

- `agents/clara/` — Clara, the public-facing onboarding agent. Ported from
  `internal/saas/clara/clara_system.txt`.
- `config.json` — picoclaw config with the `public-web` channel enabled.
- `skills/onboarding-mark-qualified/` — stub for the HMAC callback skill.
- `skills/onboarding-submit-intake/` — stub for the final-submit skill.

## When this overlays

`provision-onboarding-tenant.sh` calls
`POST /api/v1/tenants/onboarding/bootstrap`, which creates a tenant with
`IsPublic=true` and overlays this directory into the tenant's
`$PICOCLAW_HOME/workspace/`.

## Phases that need to complete before this runs end-to-end

- Phase 4: `pkg/channels/publicweb/` channel implementation
- Phase 5: launcher endpoints `POST /api/public/chat` + SSE
- Phase 6: skill scripts (HMAC callback)
- Phase 7: controlplane `POST /api/v1/onboarding-callback` handler

Until those are merged, this workspace is template-only and the bootstrap
will create a container that has no chat endpoint.
