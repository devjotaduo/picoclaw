# jotaduo-wa-sidecar

Long-running service that owns Jotaduo's institutional WhatsApp pairing and
exposes a tiny HTTP API so multiple **public tenants** can send/receive on
its behalf without each running their own whatsmeow client.

This is **Fatia 1 of 5** of the "WhatsApp Jotaduo emprestado a tenants
públicos" feature. See `docs/architecture/public-tenant-promotion.md` for
the broader product context and the full 5-fatia plan.

## Why a sidecar

`whatsmeow` (the underlying WhatsApp client library) enforces **one active
device per pairing**. If we bind-mounted the operator's `store.db` into N
public tenant containers, the SQLite WAL would lock-conflict and WhatsApp
itself would detect duplicate devices on the same identity and disconnect
the real number — catastrophic for Jotaduo's institutional WA.

The sidecar centralises that single allowed connection. Public tenants call
HTTP endpoints instead of running their own whatsmeow.

## Endpoints

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/healthz` | GET | none | Liveness probe — 200 while process is up |
| `/readyz` | GET | none | Readiness — 200 only when WA is paired AND connected; 503 with `{"status":"unpaired"}` otherwise |
| `/pair` | GET | admin token | Operator-facing HTML page; polls `/pair/qr` and renders the QR |
| `/pair/qr` | GET | admin token | JSON snapshot of current pairing state (status, QR data URI, phone) |
| `/internal/wa/send` | POST | HMAC | Tenants → send a message. Body: `{tenant_id, to, text, ts}` |
| `/internal/wa/routing` | POST | HMAC | Tenants → register a `phone → tenant_id` route. Body: `{tenant_id, phone, ts}` |
| `/internal/wa/routing/by-tenant/{id}` | GET | HMAC | List all phones routed to a tenant (debugging) |
| `/internal/wa/routing/by-tenant/{id}` | DELETE | HMAC | Controlplane → revoke all routes for a tenant (called at promotion time) |

### HMAC details

Sign the **raw request body** with `HMAC-SHA256(JOTADUO_WA_HMAC_SECRET)`,
send the hex digest in the `X-Jotaduo-WA-Signature` header. The body MUST
include a `ts` field with the current Unix timestamp; requests more than
±5 minutes off "now" are rejected to prevent replay.

Same pattern as `internal/saas/api/onboarding_callback.go` — kept on
purpose so skills can reuse the existing HMAC helper they already have.

### Admin token

The `/pair*` endpoints accept the admin token via either the
`X-Jotaduo-WA-Admin-Token` header (preferred) or a `?token=...` query string
(so the operator can paste a link in the browser). Constant-time compared.

## Environment

| Var | Required | Default | What |
|---|---|---|---|
| `JOTADUO_WA_HMAC_SECRET` | **yes** | — | Shared with tenants + controlplane. `openssl rand -hex 32` |
| `JOTADUO_WA_ADMIN_TOKEN` | **yes** | — | Gates `/pair*`. `openssl rand -hex 24` |
| `JOTADUO_WA_LISTEN` | no | `:18810` | HTTP listen address |
| `JOTADUO_WA_STORE_DIR` | no | `/var/lib/jotaduo-wa` | Directory holding `whatsapp/store.db` (whatsmeow session) + `routing.db` (phone→tenant map) |
| `JOTADUO_WA_TENANT_URL_PATTERN` | no | `http://tenant-{id}:18800` | Where the dispatcher POSTs inbound webhooks; `{id}` is substituted with the routed tenant id. Pattern MUST contain `{id}` — silent global delivery would be a cross-tenant leak |

## On-disk layout

```
/var/lib/jotaduo-wa/
├── whatsapp/
│   ├── store.db           ← whatsmeow session (device keys, prekeys, contacts)
│   └── conversations.db   ← inbox local cache (whatsapp_native inbox subsystem)
└── routing.db             ← phone → tenant_id mapping (this package)
```

Back this directory up: losing `whatsapp/store.db` requires re-pairing
(QR scan on Jotaduo's phone). Losing `routing.db` only loses pending
inbound routing — tenants will re-register on the next outbound message.

## Operator runbook

### First-time pairing

1. Compose brings up the service: `docker compose -f docker/saas/docker-compose.yml up -d jotaduo-wa`
2. Open `https://adm.<base>/jotaduo-wa/pair?token=<JOTADUO_WA_ADMIN_TOKEN>`
3. Scan the QR with the institutional WhatsApp (WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho)
4. Page shows "pareado: 55119..." — done. `/readyz` flips to 200.

### Re-pairing (lost phone, etc.)

1. Hit `DELETE /pair/qr/disconnect` with the admin token (TODO: wire route; for now `docker restart jotaduo-wa` after `rm /srv/picoclaw/jotaduo-wa/whatsapp/store.db`)
2. Open `/pair` again and scan a fresh QR.

### Audit routes

```bash
# How many leads is tenant X currently engaged with?
curl -sH "X-Jotaduo-WA-Signature: $(sign '{}')" \
  https://jotaduo-wa.internal/internal/wa/routing/by-tenant/abc123 | jq
```

## Build

```bash
make build-jotaduo-wa-sidecar          # native binary (whatsapp_native tag)
docker build -f docker/saas/Dockerfile.jotaduo-wa -t picoclaw/jotaduo-wa .
```

`docker compose up -d --build jotaduo-wa` brings the service up in dev
alongside the rest of the SaaS stack.

## Inbound dispatch (fatia 4)

When the institutional WA receives a message, the sidecar:

1. Looks up `phone → tenant_id` in `routing.db`.
2. If found: HMAC-signs the message body and POSTs to `<JOTADUO_WA_TENANT_URL_PATTERN with {id} substituted><inboundWebhookPath>` (default `http://tenant-<id>:18800/api/launcher/jotaduo-wa-inbound`).
3. If not found: logs at info level and drops (cold lead messaging the institutional number without prior outreach — common, not an error).

The launcher endpoint (registered in [web/backend/api/jotaduo_wa_inbound.go](../../web/backend/api/jotaduo_wa_inbound.go)) verifies the HMAC, rejects stale timestamps + tenant_id mismatches, and **appends the message verbatim to `workspace/state/jotaduo-wa-inbox.jsonl`** inside `$PICOCLAW_HOME`. Catarina reads that file via a follow-up skill (TODO) to surface lead replies in her own conversation context.

Best-effort delivery: a failed POST is logged and dropped — there is no retry queue. The lead's next reply will route normally.

## What's missing (deferred to fatia 5)

- **Fatia 5**: `tenants_promote.go` calls `DELETE /internal/wa/routing/by-tenant/{id}` before recreate, so a freshly-promoted cliente stops receiving inbound from the institutional WA even if the route hadn't expired.

The reader skill for Catarina (parsing `jotaduo-wa-inbox.jsonl`) ships as a small follow-up PR after fatia 5 lands — it's a workspace-only change with no infra impact.
