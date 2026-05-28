# Supabase Auth + Tenant Provisioning

This runbook covers the Supabase Auth integration that gates customer-tenant
dashboard logins and the current tenant provisioning flow. The old public
form route is not a live onboarding entrypoint anymore. Public onboarding now
starts by creating a **Público** tenant in the admin UI and opening the
tenant's public chat with Sofia.

## What this changes (and what it doesn't)

| | Before | After |
|---|---|---|
| Provisioning public onboarding tenants | Manual scripts / legacy public form | Admin UI → New tenant → **Público** → tenant public chat |
| Provisioning customer tenants | Manual via admin UI | Promote a validated public tenant, or create manually |
| Dashboard login for legacy tenants | bcrypt in `launcher-auth.db` (SQLite per tenant) | unchanged |
| Dashboard login for new tenants | bcrypt | Supabase Auth (email + senha **e** magic link, ambos entregues no mesmo email transacional), JWT in `sb-*-auth-token` cookie on `.<base-domain>` |
| Trusted gateway HMAC between controlplane and launcher | Same | Same |
| Tenant container, volume, Docker, LiteLLM key | Same | Same |
| Subdomain routing | App-level reverse proxy in controlplane | Same |

Tenants carry an `auth_backend` column (`'local'` or `'supabase'`). The
gateway middleware reads it per request and routes through the right
verifier. Migration of legacy tenants is opt-in and out-of-scope here.

## Current public onboarding path

```
Admin ──▶ adm.<base>/tenants/new
        │
        ├─ selects tenant_type=publico
        ├─ chooses workspace
        └─ creates tenant with is_public=true, no owner_email
              │
              ▼
Visitor ──▶ https://<public-subdomain>.<base>/
              │
              ├─ role=public, active_profile=public
              ├─ Sofia conducts discovery in the tenant chat
              ├─ onboarding-state records owner contact + discovery summary
              └─ Catarina deepens through the institutional WhatsApp sidecar
                    │
                    ▼
Admin promotes the public tenant to a customer tenant after validation.
```

Later: visitor clicks magic link / enters password
       ▼
   Supabase issues ES256 JWT with app_metadata
       ▼
   Browser sets sb-<projectRef>-auth-token cookie on .jotaduo.com
       ▼
   GET https://<sub>.jotaduo.com/
       ▼
   ┌────────────────────────────────────┐
   │ controlplane: tenant_gateway       │  internal/saas/api/tenant_gateway.go
   │   ├─ read tenant.auth_backend      │
   │   ├─ 'supabase' → VerifyAccessToken (JWKS by kid)
   │   ├─ claims.tenant_id == tenant.ID │
   │   └─ sign HMAC headers + proxy     │  pkg/gatewayauth
   ▼
   tenant launcher container :18800
```

## Initial setup

### 1. Supabase project (one-time)

You already have project `dgldymxofhmsfeuzgoig` in org `utpoaccalhkdydndmrvs`.
If creating fresh: pick the region closest to your VPS, enable Email
provider, optionally enable Google/Microsoft OAuth.

Configure Site URL + redirect allowlist via dashboard or Management API:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -d '{
    "site_url": "https://jotaduo.com",
    "uri_allow_list": "https://jotaduo.com,https://jotaduo.com/**,https://*.jotaduo.com,https://*.jotaduo.com/**"
  }'
```

PAT page: https://supabase.com/dashboard/account/tokens

### 2. Pull secrets into env (local-only)

```bash
cd docker/saas
SUPABASE_PAT=sbp_... PROJECT_REF=dgldymxofhmsfeuzgoig bash -c '
  {
    echo "SUPABASE_PROJECT_REF=$PROJECT_REF"
    echo "SUPABASE_SITE_URL=https://jotaduo.com"
    curl -s -H "Authorization: Bearer $SUPABASE_PAT" \
      "https://api.supabase.com/v1/projects/$PROJECT_REF/api-keys?reveal=true" \
      | python3 -c "
import sys,json
ks = json.load(sys.stdin)
print(f\"SUPABASE_ANON_KEY={next(k['\''api_key'\''] for k in ks if k.get('\''name'\'')=='\''anon'\'')}\")
print(f\"SUPABASE_SERVICE_ROLE_KEY={next(k['\''api_key'\''] for k in ks if k.get('\''name'\'')=='\''service_role'\'')}\")"
  } > .env.supabase.local
'
```

`.env.supabase.local` is gitignored. Append its contents to `docker/saas/.env`
or load it alongside via `--env-file`.

### 3. Decide on JWT secret

Modern Supabase projects (2024+) sign tokens with asymmetric keys (ES256).
The controlplane fetches the public JWKS automatically — no `SUPABASE_JWT_SECRET`
needed. Leave it blank.

Only set `SUPABASE_JWT_SECRET` if your project still uses the legacy HS256
shared secret (visible at Dashboard → Settings → API → JWT Settings). The
verifier dispatches per-token by `alg`, so projects that have both kinds of
tokens floating around (e.g. during a key rotation) work too.

### 4. Restart controlplane

```bash
docker compose -f docker/saas/docker-compose.yml --env-file docker/saas/.env up -d controlplane
docker logs -f controlplane | head -20
```

The startup log should show no `supabase client init failed` line. If the
`SUPABASE_*` vars are unset or blank, the controlplane runs in
backward-compatible mode (Supabase disabled, legacy local auth path only).

### 5. Verify with manual tenant create

```bash
# Get an admin cookie
curl -c /tmp/admin.cookie -X POST https://adm.jotaduo.com/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@jotaduo.com","password":"..."}'

# Provision a tenant manually with Supabase auth backend
# (Note: as of this writing, the admin UI doesn't yet expose the
#  auth_backend toggle. Use auto-provision below to exercise the path.)
```

End-to-end test against the real project (skipped by default, requires the
env vars in your shell):

```bash
set -a; . docker/saas/.env.supabase.local; set +a
go test -run TestSupabaseE2E -v ./internal/saas/auth/
```

## Installing the tenant workspace

`workspace/` in the repo root is the canonical operator workspace template
and the source for the first SaaS Workspace. It carries:

- 5 agents: Rafael (proactive interno), Clara (atendente), Marcos (vendas),
  Camila (suporte), Atendimento Humano — defined in `workspace/agents/*.md`.
- A 12-point proactive heartbeat (see `HEARTBEAT.md` and `heartbeat.log` —
  Rafael runs every ~5 min looking for stalled chats, hot leads, complaints,
  repeated questions, missing memory, etc).
- Pre-wired cron in `cron/jobs.json`: Maya weekly post proposals (Mon 09:00)
  and monthly positioning report (1st of month 09:00).
- 26 curated skills across 16 categories (atendimento, vendas, suporte,
  humano, memoria, interno + 10 utility/dev skills).
- 10 memory template files (empresa.md, leads.md, clientes.md, faq.md, …)
  with empty fields ready for the tenant to fill.
- 5 config files (company-profile, tone-of-voice, authorized-channels,
  escalation-rules, lead-scoring) — also empty templates.

To bootstrap a SaaS environment from this template:

1. Sync the repo's `workspace/` into the host at
   `/srv/picoclaw-workspaces/default-business/home/workspace/`. Plus a
   `home/config.json` with the `${LITELLM_KEY}` placeholder and a
   `home/.security.yml`. The exact files an admin-managed workspace must
   contain are in [`docs/architecture/workspaces.md`](../architecture/workspaces.md).

   ```bash
   # from your dev box
   ssh root@vps.jotaduo.com 'install -d /srv/picoclaw-workspaces/default-business'
   scp -r workspace root@vps.jotaduo.com:/srv/picoclaw-workspaces/default-business/home/
   scp config.json .security.yml root@vps.jotaduo.com:/srv/picoclaw-workspaces/default-business/home/
   ```

2. Insert the DB row via `POST /api/v1/workspaces` (or use the admin UI's
   "Importar do $PICOCLAW_HOME" pointing at
   `/srv/picoclaw-workspaces/default-business/home`). Mark
   `is_default_auto=true` so the auto-provisioner picks it up; mark
   `is_available_manual=true` so it appears in the New Tenant dropdown.

3. Optionally compile the per-workspace frontend (`/workspaces` →
   "Compilar frontend") if you want a custom UI; the launcher falls back
   to its embedded dist when no compiled build exists.

The compose file binds `/srv/picoclaw-workspaces` (host) at the same
path inside the controlplane container, read-write so the admin file
editor can persist changes. Edits via the admin UI propagate to NEW
tenants automatically; existing tenants need a re-provision (or a manual
re-copy of the home/ subtree into their volume).

## Onboarding lifecycle (tenant público → Sofia → Catarina)

The first conversation happens inside the public tenant itself. The public
tenant is the live entrypoint; Sofia is the first visible agent, and
Catarina takes over the deepening questions through the institutional
WhatsApp sidecar.

```
T+0s    Admin cria um tenant público pelo wizard:
        New tenant → Público → workspace → Criar.

T+~60s  O container fica active. O visitante abre
        https://<subdomain>.<base>/ e fala com Sofia no chat público.
        O papel efetivo é `public`; o tenant tem `active_profile=public`.

T+~Ns   Sofia coleta nome, email, WhatsApp, segmento, horários, endereço,
        canais, pagamentos, regras de handoff e limites do atendimento.
        Ela grava `memory/empresa.md` e atualiza
        `workspace/state/onboarding.json` via `onboarding-state`.

T+~N+Ms Quando o discovery básico fica completo, o estado muda para
        `discovery_done`. O bridge Sofia → Catarina pode disparar a
        primeira mensagem pelo `jotaduo-wa` institucional.

T+~N+Ms Catarina manda a primeira pergunta de aprofundamento ao WhatsApp
        capturado por Sofia. O estado registra `first_contact_at` e
        `last_outreach_at` para evitar reenvio duplicado.

T+later Catarina fecha as áreas exigidas (`equipe`, `casos-excecao`,
        `faq`, `historico`, `regras-tacitas`). Quando o estado fica
        `ready_for_promotion`, o admin promove o tenant público para
        cliente normal.

T+promote O backend cria/associa o owner Supabase, troca o tenant para
          `is_public=false`, recria o container sem credenciais
          institucionais da Jotaduo e o cliente passa a parear o WhatsApp
          comercial próprio.
```

### Por que Catarina usa o WhatsApp institucional nessa fase

O tenant público ainda não pertence a uma empresa cliente e não deve receber
credenciais permanentes do WhatsApp comercial. Catarina usa
`JOTADUO_WA_URL` + `JOTADUO_WA_HMAC_SECRET`, injetados apenas em
`is_public=true`, para falar pelo número institucional da Jotaduo. Na
promoção, o recreate do container remove esses envs.

### Casos de borda do público

| Cenário | Comportamento atual |
|---|---|
| Visitante abre o tenant antes do gateway subir | A UI mostra indisponibilidade temporária. O probe real é `GET /api/public/chat/health`. |
| Papel `public` sem policy de chat/logs | `/api/gateway/status` ou `/pico/ws` podem retornar 403 e a UI parece offline. O default precisa de `chat=write` e `logs=read`. |
| Catarina já enviou a primeira mensagem | `first_contact_at` impede o bridge de disparar de novo. Use `mark_outreach_sent` só para novas mensagens intencionais. |
| Lead demora a responder | `last_outreach_at` alimenta o alerta de timeout, mas não bloqueia promoção sozinho quando o restante está pronto. |
| Admin promove cedo | Use o escape hatch de promoção apenas com `memory/empresa.md` preenchido; o tenant cliente perde acesso ao WhatsApp institucional ao ser recriado. |

### O que Sofia faz quando os pendentes acabam

Quando todos os campos críticos de `memory/empresa.md` e
`config/company-profile.md` estão `Status: validada`, o item 9 do
heartbeat ("informações faltando na memória") deixa de disparar.
Sofia volta ao modo operacional padrão — varre os outros 11 sinais
(lead quente, cliente irritado, atendimento parado, FAQ nova, etc.)
a cada 5 minutos e gera alertas pro dono no canal que estiver ativo.

### Monolítico vs multi-agent — qual modelo o tenant roda

O `workspace/` canônico ship em **modo monolítico**: um único agente `main`
implícito que recebe o prompt agregado de `AGENT.md` + `AGENTS.md` +
`IDENTITY.md` + `SOUL.md` + `USER.md` + `TOOLS.md` + `config/*` +
`HEARTBEAT.md` + `memory/MEMORY.md`. As personas (Sofia, Clara, Marcos,
Camila, Maya, Humano) vivem como sub-arquivos em `workspace/agents/*.md`
e o LLM adota o papel certo conforme o contexto:

- canal `pico` interno + memória com pendentes → o LLM adota Sofia
- WhatsApp comercial chegando mensagem de cliente → adota Clara → delega pra Marcos/Camila/Maya conforme o caso
- cron job → adota Maya pra geração de marketing

`config.json` seedado por `SeedPicoConfig` deixa `agents.list` **vazio**,
portanto não há `agents.dispatch` aplicado e tudo cai no main. As regras
de "quem chama quem" são prompt-level (lidas via AGENTS.md), não
config-level.

**Por que monolítico:**

- Não exige criar workspace separado por agente dentro do volume (`workspace-sofia/`, `workspace-clara/`, ...) — fica tudo em `workspace/`.
- O cron pode chamar `agent_id: "main"` e Maya é uma persona que main adota; o prompt já inclui `agents/maya-marketing.md` então o LLM sabe como agir.
- LiteLLM key é uma só; modelo é um só. Multi-agent em prod tem agentes com modelos diferentes (qwen-plus pra vendas, qwen-multimodal pra marketing), o que dobra custo de teste.

**Trade-offs:**

- `panel space=agent:maya` no painel do tenant não roteia automaticamente pra Maya — todas as conversas do painel vão pro main. O dono pode escrever "Maya, prepara um post" e o main adota.
- Delegação por nome (`spawn agent_id="maya"`) não funciona no sentido de criar agente separado — só simula a persona dentro do mesmo loop.
- Para tenants que crescerem e quiserem rotas distintas por agente (Maya com modelo multimodal, Marcos com modelo barato pra qualificação rápida), promover pra multi-agent é uma migração futura: criar `agents.list` no `config.json` do tenant + popular `workspace/agents/<id>/AGENT.md` por agente.

**Cron pré-instalado** (`workspace/cron/jobs.json`):

- `marketing-weekly-proposals` — toda segunda 9h, payload aponta `agent_id: "main"` e a mensagem começa com `[Tarefa de Maya — marketing]` pra o LLM adotar a persona certa.
- `marketing-monthly-positioning` — todo dia 1, 9h, mesma estrutura.

Em produção, esses crons só geram conteúdo útil DEPOIS que `memory/marca.md` e `memory/marketing.md` estiverem preenchidos pela Sofia no onboarding. Antes disso, Maya devolve `PENDENCIAS:` com a lista do que falta — não inventa.

### Lembretes automáticos de onboarding

Quando o `AutoProvisioner.Run` termina com sucesso, três emails de
lembrete são agendados na tabela `intake_reminders`. Um worker em
background no controlplane (`api.ReminderWorker`, tick de 5 min)
verifica linhas vencidas e envia via o `mailer.Mailer` existente.

Sequência padrão (offsets em código, podem ser ajustados):

- **T+24h** — `first`: "Faz um dia, a Sofia tá te esperando no painel"
- **T+72h** — `second`: "Sua Sofia ainda tá esperando; em 5 min vocês fecham a base"
- **T+7d** — `last`: "Último lembrete; se mudou de ideia tudo bem, é só responder esse email"

Cada email lembra que a próxima conversa é **no painel** (não no
WhatsApp) e leva pra `https://<sub>.jotaduo.com`. O magic link
original do Supabase pode ter expirado em 1h, então o email instrui
a responder pra receber outro (o endpoint `resend-link` ainda exige
o resume_token original, então responder por email é mais simples
pro visitante).

**Cancelamento automático**: na primeira vez que o tenant gateway
verifica um JWT Supabase válido do dono, `tenants.initial_password_delivered`
é flipado pra true e `IntakeReminderStore.CancelByTenant` marca os
reminders pendentes como `cancelled_at = now()` com motivo
`"owner first auth"`. Visitantes que entram dentro de 24h nunca
recebem nenhum dos emails.

**Anti-spam**: o worker se recusa a re-enviar reminders já marcados
sent_at; tem max 5 attempts por linha; é idempotente em reboot
(reinicia do estado da tabela). Se o email do visitante bouncar, a
linha fica com `last_error` setado pra admin inspecionar via:

```sql
SELECT intake_id, template, attempts, last_error
FROM intake_reminders
WHERE last_error IS NOT NULL
ORDER BY scheduled_at DESC;
```

**Roadmap**: o schema já carrega `channel ∈ ('email','whatsapp')`
mas só `email` está implementado. Quando uma WhatsApp Business API
de outreach for plugada (Twilio, Meta Business, etc.), o worker
ganha um case `whatsapp` em `deliver()` e novos reminders podem ser
agendados com esse canal — sem mudar o schema.

## Legacy intake auto-provision

```bash
# Edit docker/saas/.env
PICOCLAW_SAAS_AUTO_PROVISION=true
PICOCLAW_SAAS_AUTO_PROVISION_PER_IP_DAY=3
# Auto-provision picks the workspace marked `is_default_auto` — mark one
# via adm.<base>/workspaces before turning this on, otherwise the
# qualifier returns "no workspace is marked is_default_auto".
#
# Note: login mode is no longer a toggle. When Supabase is configured the
# new tenant owner always receives email + senha AND a magic link in the
# same transactional email (rendered from credentials.{html,txt}.tmpl).

docker compose -f docker/saas/docker-compose.yml up -d controlplane
```

This is kept for legacy intake experiments only. It is not the current public
onboarding path. For the live flow, create a tenant with type **Público** in
the admin UI and start the discovery through Sofia in that tenant.

```bash
docker logs -f controlplane | grep -E "(autoProvision|tenant_provisioned|provision_error)"
docker ps --filter "label=picoclaw.saas.managed=true" --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"
```

## Custom SMTP for the credentials email (Brevo)

Without this, `Mailer.Enabled()` returns `false` and `SendCredentialsEmail`
just logs — the tenant owner never receives the email. The senha + magic link
are then only visible in the admin dialog / legacy intake response, which works
for manual operator delivery but not for the SMB self-serve flow.

Pick a provider with a free tier. We've validated **Brevo** (300 emails/day
free, good Gmail/Outlook delivery in BR) — instructions assume it. Same shape
works for SendGrid (`smtp.sendgrid.net:587`), Resend (`smtp.resend.com:465`),
Mailgun, etc. — only `SMTP_HOST/PORT/USER/PASSWORD` change.

### One-time setup (≈10 min)

1. **Sign up** at https://app.brevo.com — free tier, no credit card required.

2. **Verify the sending domain** (must match `MAILER_FROM`, e.g.
   `jotaduo.com`). Senders & IP → Domains → "Add a domain" → publish the 3
   DNS records Brevo gives you on your DNS provider:
   - `brevo-code` TXT (verification)
   - `dkim` TXT (long key, signs outgoing mail)
   - SPF — add `include:spf.brevo.com` to your existing SPF record (or
     create `v=spf1 include:spf.brevo.com -all` if you don't have one).

   Click "Authenticate this domain" and wait until all three rows show a
   green check (usually <5 min, can take up to a few hours).

3. **Generate an SMTP key**. SMTP & API → SMTP tab → "Generate a new SMTP
   key". Copy it (only shown once).

4. **Note the SMTP login**. Same SMTP tab, top of the page. It's the
   account login email (e.g. `dev@jotaduo.com`), **not**
   `contato@jotaduo.com`. We use the login for SMTP_USER and the SMTP key
   for SMTP_PASSWORD; the From header is independent (`MAILER_FROM`).

5. **Add to `docker/saas/.env.deploy-vps.local`**:

   ```bash
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=<your brevo login email>
   SMTP_PASSWORD=<the SMTP key from step 3>
   MAILER_FROM=contato@jotaduo.com
   MAILER_ADMIN_URL=https://adm.jotaduo.com
   ```

6. **Configure Supabase Auth's own SMTP** (choose one of two options):

   **Option A — leave it disabled (simplest).** Dashboard → Auth → Email
   Templates → SMTP Settings — ensure "Enable custom SMTP" is off. With
   no custom SMTP, `AdminGenerateLink` returns the link without sending
   an email (the built-in Supabase sender is rate-limited to ~4/h and only
   ships to project team emails anyway). Our own `Mailer.SendCredentialsEmail`
   already delivers the magic link, so the owner gets exactly one email.
   The trade-off: `ResendMagicLink` (the public `/resend-link` endpoint)
   won't reach end users — only project team members can receive it.

   **Option B — point Supabase Auth at the same Brevo account** so
   `ResendMagicLink` and other Supabase-driven emails work for real users
   without hitting the 4/h built-in limit. Run the helper script (only
   touches Supabase Auth config, not the controlplane's `Mailer`):

   ```bash
   export SUPABASE_ACCESS_TOKEN="sbp_..."     # https://supabase.com/dashboard/account/tokens
   export SMTP_USER="$SMTP_USER"              # same value as step 5 above
   export SMTP_PASSWORD="$SMTP_PASSWORD"      # same value as step 5
   export MAILER_FROM="$MAILER_FROM"          # used as smtp_admin_email
   ./scripts/supabase-configure-smtp.sh        # PATCHes /config/auth via Management API
   ```

   This sets `rate_limit_email_sent: 10/h` on the Supabase Auth side —
   intentionally low because the primary delivery is our own `Mailer`;
   Supabase Auth is only used for resend/recover edge cases. Because
   `AdminGenerateLink` would normally send a magic-link email when a
   custom SMTP is configured, you'd get TWO emails on tenant creation
   (one from Supabase, one from us). To prevent that: in the dashboard,
   open Auth → Email Templates → "Magic Link" and uncheck the "Enabled"
   toggle. The `AdminGenerateLink` call still returns the URL via the
   API even when the template is off; only the email send is suppressed.
   The "Reset password" and "Confirm signup" templates can stay enabled
   if you want those flows to email visitors.

7. **Restart the controlplane** (after the new image lands via the GHA
   pipeline, or for a local-built image rebuild):

   ```bash
   docker compose -f docker/saas/docker-compose.yml up -d controlplane
   ```

8. **Smoke test**. Open `adm.<base>/tenants/new`, create a tenant with a
   fresh email you can read. The owner should receive a single email titled
   "Acesso ao painel <Tenant> — Jotaduo" with URL, login, senha, e magic
   link. Watch logs:

   ```bash
   docker logs -f controlplane | grep -i mailer
   ```

   A successful send is silent (we only log on failure). Brevo's dashboard
   shows delivery status in real time under "Statistics → Email".

### Daily-limit gotchas

- Brevo free tier resets at 00:00 UTC. Hitting the cap returns SMTP 550 —
  surfaced in `controlplane` logs as `mailer: send credentials to … failed`.
- If you ever exceed 300/day reliably, switch to Brevo's paid plan or move
  to SES (sandbox approval + cheaper at scale).
- Bounce/spam reports above ~1% will eventually pause the account. Reply
  to the verification email in your DNS provider's contact field and keep
  the bounce rate low by validating typos in `owner_email` at the form
  level (already done in `NewTenant.tsx`).

## Operations

### Rotate keys

- **Service role key**: roll via dashboard → Settings → API → "Generate new
  service_role". Update `.env.supabase.local`, restart controlplane. No
  user-visible downtime; in-flight admin operations may fail and need retry.
- **Anon key**: dashboard → Settings → API → "Generate new anon". Frontend
  reads it from build-time env (`VITE_SUPABASE_ANON_KEY` etc., currently
  hard-coded in the env example) — needs frontend rebuild + deploy.
- **JWT signing keys**: dashboard → Settings → API → "Signing keys" → Rotate.
  The previous key keeps verifying old tokens (status: `previously_used`)
  during a 24h grace window. JWKS verifier picks the right one by `kid`
  automatically; no controlplane restart needed.

### Resend a magic link

If an owner lost the credentials email (or just the magic link inside it):

```
POST /api/v1/public/company-intakes/{id}/resend-link
{ "resume_token": "..." }
```

Same per-IP rate limit as the public intake endpoints.

### Delete a Supabase-backed tenant

```bash
curl -X DELETE -b /tmp/admin.cookie https://adm.jotaduo.com/api/v1/tenants/<tenant-id>
```

The provisioner's `Delete()` chains:
1. SoftDelete (status=`deleting`)
2. Docker container remove
3. LiteLLM key delete
4. **Supabase user delete** (best-effort — logs and continues on 404)
5. Volume remove
6. DB cascade

If the process dies mid-delete, the reconciler resumes from `ListPendingCleanup`.

### Migrate a legacy tenant to Supabase

Manual, one-tenant-at-a-time:

```sql
-- Pick the owner email from the tenant row
SELECT id, owner_email, subdomain FROM tenants WHERE id = '<tenant-id>';
```

```bash
# Create the Supabase user via Admin API with app_metadata
curl -X POST "$PROJECT_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "apikey: $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"<owner-email>\",
    \"email_confirm\": true,
    \"app_metadata\": {
      \"tenant_id\": \"<tenant-id>\",
      \"subdomain\": \"<subdomain>\",
      \"role\": \"owner\"
    }
  }"
# Returns {"id":"<uuid>",...}
```

```sql
UPDATE tenants
SET supabase_user_id = '<uuid>'::uuid, auth_backend = 'supabase'
WHERE id = '<tenant-id>';
```

Send the owner a magic link via the admin API or the new resend endpoint.
The legacy `launcher-auth.db` inside the volume stays as dead weight — safe
to leave for now, can be cleaned up later if you wipe `auth_backend='local'`
tenants entirely.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `tenant_provisioned` fires but visitor can't log in | Supabase user created but `supabase_user_id` not saved on tenant row (very brief race) | Run the migration SQL above, or `Provisioner.Delete` and retry. |
| `provision_error` SSE event with "supabase create user" | service_role key invalid, or user already exists in `auth.users` | Check Supabase Auth → Users; dedup-by-email should normally catch repeats. |
| Magic link email never arrives | Supabase project's email rate limit hit, or domain reputation issue | Dashboard → Auth → Rate Limits; or switch to custom SMTP for prod. |
| Verify fails for ES256 tokens | JWKS endpoint unreachable from controlplane | `curl https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` from inside the container. |
| Verify fails for HS256 tokens | Project uses asymmetric keys now; the HS256 token is from a different project or forged | Inspect the token: `echo $JWT | cut -d. -f1 | base64 -d`. |
| Every dashboard request redirects to `/login` | `auth_backend='supabase'` but cookie not present, or wrong domain | Confirm cookie scope is `.jotaduo.com`, not `<sub>.jotaduo.com`. |
| Legacy auto-provision does not run | `PICOCLAW_SAAS_AUTO_PROVISION=false`, missing default workspace, or intake never reached submit | `docker logs controlplane \| grep -E "autoProvision\|submit"`; for the live public flow, prefer admin-created **Público** tenants. |
| Tenant subdomain returns TLS `unrecognized name` | Traefik only pre-issues certs for concrete `Host()` routers; the controlplane uses `HostRegexp` which doesn't trigger ACME | Confirm `picoclaw-tenant-router.service` is running on the VPS (see `docker/saas/scripts/tenant-router/install.sh` and `docs/operations/saas-vps-deploy.md` step 8). |

## Rollback (turn it all off)

Auto-provision off:

```bash
# docker/saas/.env
PICOCLAW_SAAS_AUTO_PROVISION=false
docker compose -f docker/saas/docker-compose.yml up -d controlplane
```

Supabase off (forces all tenants back to local auth):

```bash
# Comment out all SUPABASE_* lines in docker/saas/.env
docker compose -f docker/saas/docker-compose.yml up -d controlplane
```

`auth_backend='supabase'` tenants will start failing dashboard logins (their
local bcrypt was never seeded — `SkipDashboardPassword=true`). Recovery:
either re-enable Supabase or migrate them back via `Provisioner.RotatePassword`
+ `UPDATE tenants SET auth_backend='local', supabase_user_id=NULL`.

## Reference

- Schema migration: `internal/saas/store/migrations/0009_tenants_supabase.sql`
- Supabase client: `internal/saas/auth/supabase.go`
- Auto-provision orchestrator: `internal/saas/api/company_intakes_provision.go`
- Gateway middleware: `internal/saas/api/tenant_gateway.go`
- Workspace overlay: `internal/saas/tenant/template.go` (`OverlayWorkspace`)
- Tests: `internal/saas/auth/supabase_test.go`, `internal/saas/auth/supabase_e2e_test.go`
- Config: `internal/saas/config/config.go` (all `Supabase*` and `AutoProvision*` fields)
- Env template: `docker/saas/.env.supabase.example`
- Compose entry: `docker/saas/docker-compose.yml` (controlplane service env block)
