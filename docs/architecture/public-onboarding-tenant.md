# Public Onboarding Tenant

The "public onboarding tenant" is a Picoclaw tenant marked `is_public=true`
that serves anonymous visitors at `https://onboarding.<base>` and runs the
Clara discovery chat. It's the planned replacement for the legacy in-process
Clara handler in `internal/saas/clara/` — same UX, but Clara is now a full
Picoclaw agent (skills, memory, multi-channel, editable via dashboard)
instead of a stateless LLM client living inside the controlplane Go binary.

## Why a dedicated tenant

| Capability | Legacy Clara (`internal/saas/clara/`) | Public onboarding tenant |
|---|---|---|
| Editable prompt without deploy | ❌ (`clara_system.txt` is embedded) | ✅ `workspace/agents/clara/AGENT.md` |
| Skills / MCP / RAG | ❌ | ✅ catálogo completo do Picoclaw |
| Memory persistente entre conversas | ❌ | ✅ `workspace/memory/` |
| Multi-canal (WhatsApp, Telegram…) | ❌ só web SSE | ✅ qualquer canal habilitado |
| Cron jobs / proativo | ❌ | ✅ |
| Isolated LLM key + budget | ❌ pool compartilhado | ✅ per-tenant LiteLLM key |
| Versão multi-idioma / A/B test | ❌ | ✅ 2 tenants paralelos |

## Architecture in one diagram

```
Visitor browser
   │  POST /api/public/chat  {session_id, message}
   │  GET  /api/public/chat/stream?session_id=…  (SSE)
   ▼
[Cloudflare/Traefik]
   │
   ▼ Host: onboarding.jotaduo.com
[controlplane :443] (internal/saas/api/tenant_gateway.go)
   │
   │ serveTenantHost:
   │   1. tenant ← GetBySubdomain("onboarding")  → is_public=true
   │   2. if isPublicChatRoute(/api/public/chat[/*]) && tenant.IsPublic:
   │        skip Supabase JWT;
   │        sign trusted_gateway HMAC with sentinel claims
   │        (UserID="anonymous", Role="public")
   │
   ▼ reverse proxy to tenant-<id>:18800
[tenant launcher] (web/backend/api/public_chat.go)
   │
   │ proxy with FlushInterval=-1 (SSE) → gateway HTTP server
   │
   ▼
[tenant gateway] (pkg/channels/manager.go SetupHTTPServer)
   │
   │ WebhookHandler dispatch:
   │   publicweb.Channel.WebhookPath() == "/api/public/chat"
   │
   ▼
[pkg/channels/publicweb/]
   │
   │ ServeHTTP:
   │   POST  → AcceptInbound(ctx, sessionID, ip, text)
   │            publish on bus.MessageBus
   │   GET stream → SubscribeStream(sessionID) → per-session chan
   │   GET health → 200 {"ok":true}
   │
   │ Identity: "public-web:" + hex(sha256(sessionID+"|"+ip)[:8])
   │
   ▼ inbound message → agent loop → Clara responds
[agent loop / pkg/agent/]
   │
   │ When discovery complete, Clara calls skills:
   │   onboarding-mark-qualified  → scripts/mark-qualified.sh
   │   onboarding-submit-intake   → scripts/submit-intake.sh
   │
   │ Both scripts sign HMAC-SHA256(body) with
   │ PICOCLAW_ONBOARDING_CALLBACK_SECRET, POST to:
   │
   ▼
[controlplane :443] POST /api/v1/onboarding-callback
(internal/saas/api/onboarding_callback.go)
   │
   │ verify HMAC + timestamp (±5min) → dispatch:
   │   mark_qualified → CompanyIntakes.MarkQualifiedByID
   │   submit_intake  → SetContactInfo + SubmitByID + AutoProvisioner.Run
   │                    (creates the customer's tenant + Supabase user +
   │                     dispatches Mailer.SendCredentialsEmail)
```

## Phase status (commits on `feat/public-onboarding-tenant`)

| Phase | Status | Commit | Notes |
|---|---|---|---|
| 1. `tenants.is_public` column | ✅ | `5e38496f` | migration 0011 + struct field |
| 2. `Provisioner.CreateInput.IsPublic` | ✅ | `e9194494` | `normalize()` helper, forces SkipDashboardPassword |
| 3. Gateway bypass on `/api/public/chat*` | ✅ | `0e13ec92` | sentinels: `UserID:"anonymous"`, `Role:"public"` |
| 4. `pkg/channels/publicweb/` adapter | ✅ | `36d84a66` | SSE multiplexer, anon identity hashing |
| 5. Launcher HTTP endpoints | ✅ | `63aa7ce0` | WebhookHandler + launcher reverse proxy |
| 6. Skill scripts (HMAC callback) | ✅ | `0dec…` | `mark-qualified.sh`, `submit-intake.sh` |
| 7. Controlplane callback endpoint | ✅ | `603e436d` | HMAC verify + anti-replay ±5min |
| 8. workspace-onboarding/ template | ✅ | `f78d7c34`+`21cc044c` | Clara ported as Picoclaw agent |
| 9. Bootstrap script + endpoint | ✅ | `889dd4b7` | `POST /api/v1/tenants/onboarding/bootstrap` |
| 10. Frontend cutover (feature flag) | 🚧 stub | `7829cfe7` | `VITE_USE_ONBOARDING_TENANT` env scaffold; real cutover needs SSE event-shape adapter |
| 11. Delete `internal/saas/clara/` | ⏸ | — | wait 1-2 weeks of stable parallel operation |
| 12. Docs + memory | ✅ | (this commit) | |

## Sentinel claims

`gatewayauth.VerifyRequest` rejects `UserID == ""` or `Role == ""`, so the
bypass on public-chat routes can't sign empty claims. Instead it uses:

- `UserID: "anonymous"`
- `Role: "public"`

These pass HMAC validation but are not recognized by any RBAC policy
(`policy.Allowed`), so they couldn't accidentally grant access to private
tenant routes even if the path classifier had a bug — defense in depth.

## Required production env vars

Beyond the existing Supabase + Brevo + auto-provision vars (see
`docs/operations/supabase-auth.md`), the onboarding tenant needs:

```bash
# Same value on controlplane AND inside the onboarding tenant container.
# Generate via: openssl rand -hex 32
PICOCLAW_ONBOARDING_CALLBACK_SECRET=...

# Inside the onboarding tenant container only (mark-qualified.sh +
# submit-intake.sh read these):
PICOCLAW_ONBOARDING_CALLBACK_URL=https://adm.jotaduo.com
PICOCLAW_ONBOARDING_CALLBACK_SECRET=...  # same as above

# When activating the frontend cutover (Phase 10 functional):
VITE_USE_ONBOARDING_TENANT=true
VITE_ONBOARDING_TENANT_URL=https://onboarding.jotaduo.com
```

## Bootstrap (one-time per environment)

1. Ensure `PICOCLAW_ONBOARDING_CALLBACK_SECRET` is set on the controlplane
   and exported into the onboarding tenant container by the bootstrap
   endpoint (TODO: confirm provisioner threads it into the container env;
   see `internal/saas/tenant/provisioner.go buildSpec`).
2. Place the workspace template:
   ```bash
   scp -r workspace-onboarding root@vps:/srv/picoclaw/
   ```
3. Run the bootstrap:
   ```bash
   export ADM_SESSION_COOKIE="<your platform_admin session cookie>"
   ./scripts/provision-onboarding-tenant.sh
   ```
4. Verify:
   ```bash
   curl -sS https://onboarding.jotaduo.com/api/public/chat/health  # → {"ok":true}
   curl -sS -X POST https://onboarding.jotaduo.com/api/public/chat \
     -H 'Content-Type: application/json' \
     -d '{"session_id":"smoke","message":"oi"}'                   # → 202
   curl -N "https://onboarding.jotaduo.com/api/public/chat/stream?session_id=smoke"
   # → SSE: event: open → eventual {text: "..."} from the agent
   ```

## Known gaps (follow-ups outside this branch)

- **Phase 10 functional cutover.** The frontend flag is read but the fetch
  path still uses the legacy endpoint. Real cutover requires either:
  (a) an event-shape adapter in `useClaraChat.ts` that maps the
  publicweb `{text:"..."}` chunks onto the legacy `{type, delta, ...}`
  structure + the secondary GET for the SSE stream; or
  (b) richer events emitted by `publicweb.Channel.Send` and the onboarding
  skills (`tenant_provisioned`, `extracted`, `tool_applied`) matching the
  current SSE contract.
- **Provisioner needs to thread `PICOCLAW_ONBOARDING_CALLBACK_SECRET` +
  `PICOCLAW_ONBOARDING_CALLBACK_URL` into the onboarding tenant container.**
  Today `buildSpec` doesn't know about these vars. Either special-case
  `is_public=true` tenants or accept the vars as part of the bootstrap
  payload.
- **DDoS protection on `/api/public/chat`.** The channel has a settings
  field `RequireCaptchaHeader` but the controlplane doesn't validate the
  header value. Wire Cloudflare Turnstile (or similar) when activating
  in prod.
- **IP-roaming visitors.** Identity is `sha256(session_id+ip)[:8]`, so a
  mobile→wifi switch mid-conversation creates a new identity and the agent
  loses context. Acceptable v1; revisit if real-world complaint.
- **Phase 11 — delete `internal/saas/clara/`.** Wait at least 1-2 weeks of
  stable parallel operation with the flag flipped in prod before removing
  the ~3000-LOC legacy handler.
