# Public Tenant Onboarding

A public onboarding tenant is a normal Picoclaw tenant marked
`is_public=true`. It is created through the admin "New tenant" wizard with
tenant type **Público**. Visitors open the tenant subdomain and start in the
public chat with **Sofia**. After Sofia captures the discovery, **Catarina**
uses the institutional Jotaduo WhatsApp sidecar to deepen the missing areas.

The old standalone public form is not a live entrypoint. Keep new work aligned
with `docs/architecture/public-tenant-promotion.md`.

## Why a dedicated tenant

| Capability | Legacy in-process intake | Public onboarding tenant |
|---|---|---|
| Editable prompt without deploy | ❌ embedded prompt | ✅ `workspace/agents/sofia/AGENT.md` / public `workspace/AGENT.md` |
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
   ▼ Host: <public-subdomain>.jotaduo.com
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
   ▼ inbound message → agent loop → Sofia responds
[agent loop / pkg/agent/]
   │
   │ Sofia records owner contact + discovery through:
   │   onboarding-state/scripts/state.py
   │   memory/empresa.md
   │
   │ When discovery is done, bridge-flow can dispatch Catarina:
   │   skills/bridge-flow/scripts/run.sh
   │   skills/enviar-whatsapp-jotaduo/scripts/send.py
   │
   ▼
[jotaduo-wa sidecar] sends Catarina's first WhatsApp question
   │
   ▼
Admin promotes the public tenant when onboarding.json is ready.
```

## Phase status (commits on `feat/public-onboarding-tenant`)

| Phase | Status | Commit | Notes |
|---|---|---|---|
| 1. `tenants.is_public` column | ✅ | `5e38496f` | migration 0011 + struct field |
| 2. `Provisioner.CreateInput.IsPublic` | ✅ | `e9194494` | `normalize()` helper, forces SkipDashboardPassword |
| 3. Gateway bypass on `/api/public/chat*` | ✅ | `0e13ec92` | sentinels: `UserID:"anonymous"`, `Role:"public"` |
| 4. `pkg/channels/publicweb/` adapter | ✅ | `36d84a66` | SSE multiplexer, anon identity hashing |
| 5. Launcher HTTP endpoints | ✅ | `63aa7ce0` | WebhookHandler + launcher reverse proxy |
| 6. Legacy HMAC callback scripts | removed | — | Replaced by `onboarding-state` + tenant chat + admin promotion |
| 7. Legacy controlplane callback endpoint | removed | — | No live route; do not build new work on callbacks from tenant skills |
| 8. Public-tenant workspace template | ✅ | `f78d7c34`+`21cc044c`+(this) | `workspace/` is the source; public tenants override `workspace/AGENT.md` so Sofia is the discovery default. |
| 9. Bootstrap script + endpoint | ❌ removed in PR #104 | `889dd4b7` (added), PR #104 (removed) | Singleton public tenant now created through the normal wizard with `tenant_type=publico`. Script `scripts/provision-onboarding-tenant.sh` is broken. |
| 10. Tenant-root public chat | ✅ | current | Public tenants can serve the chat shell as role `public`; policy allows chat write + logs read only. |
| 11. Legacy intake cleanup | ✅ | current | Removed the standalone public form, in-process Clara chat, callbacks, and old onboarding skills. |
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

Beyond the existing Supabase/Brevo vars (see
`docs/operations/supabase-auth.md`), public onboarding needs:

```bash
# Controlplane. Institutional WhatsApp sidecar used only by public tenants.
JOTADUO_WA_URL=http://jotaduo-wa:18810
JOTADUO_WA_HMAC_SECRET=...

# Injected automatically into is_public=true tenant containers.
PICOCLAW_PUBLIC_TENANT=true
PICOCLAW_ALLOWED_CHANNELS=whatsapp_native,pico,public-web
```

## Bootstrap (one-time per environment)

> **Updated 2026-05-25 (PR #104).** The dedicated bootstrap endpoint +
> script were removed. Use the normal wizard with `tenant_type=publico`.

1. Set `JOTADUO_WA_URL` and `JOTADUO_WA_HMAC_SECRET` on the controlplane.
   `buildSpec` propagates these public-only values into `is_public=true`
   containers.

2. Create the onboarding workspace via the admin UI. The recommended flow:
   ```bash
   pwsh scripts/build-workspace-zip.ps1 -SourceDir workspace -Slug onboarding \
       -Name "Onboarding"
   ```
   That packages the repo's `workspace/` tree (Sofia is the discovery agent
   there; `channel_list.public-web` is present but disabled by default, so
   the SaaS upload step flips it on for the public variant). Upload via
   admin UI → `/workspaces` → "Upload .zip". The upload runs
   `validateWorkspaceConfigSemantics` — fix any blockers before continuing.

   Optional: click "Compilar frontend" if you want a per-workspace UI build
   (the embedded launcher dist is the fallback otherwise).

3. Create the singleton public tenant via the admin "New tenant" wizard:
   - Pick the **Público** card (step 1 of the wizard).
   - Workspace = the one from step 2.
   - Submit. No owner email required — `resolveUIProfile("publico")`
     translates to `IsPublic=true` + `SkipDashboardPassword=true` +
     `active_profile=public` written into `ui-visibility.json`.

4. Verify:
   ```bash
   curl -sS https://<public-subdomain>.jotaduo.com/api/public/chat/health
   # → {"ok":true}

   curl -sS -X POST https://<public-subdomain>.jotaduo.com/api/public/chat \
     -H 'Content-Type: application/json' \
     -H 'X-Captcha-Token: <validated-token>' \
     -d '{"session_id":"smoke","message":"oi"}'
   # → 202

   curl -N "https://<public-subdomain>.jotaduo.com/api/public/chat/stream?session_id=smoke"
   # → SSE: event: open → eventual {text: "..."} from the agent
   ```

## Known gaps (follow-ups)

- **Bridge observability.** `bridge-flow` records first contact and outreach
  timestamps. Keep alerts on failed WhatsApp sends so Catarina does not
  silently stop after Sofia completes discovery.
- **Public chat captcha UX.** `public-web` requires `X-Captcha-Token` when
  configured. Any visitor-facing UI must obtain and attach a validated token
  before posting to `/api/public/chat`.
- **IP-roaming visitors.** Identity is `sha256(session_id+ip)[:8]`, so a
  mobile→wifi switch mid-conversation creates a new identity and the
  agent loses context. Acceptable v1; revisit if real-world complaint.
Already addressed (no longer gaps):

- ✅ The legacy standalone public form and callback path were removed.
  The only live onboarding path is admin-created public tenant → Sofia chat →
  Catarina WhatsApp → admin promotion.
- ✅ Cloudflare Turnstile verification lives in
  `internal/saas/api/turnstile.go`, opt-in via `TURNSTILE_SECRET_KEY`.
  Fail-closed (403 on token rejection or Cloudflare infra failure).
