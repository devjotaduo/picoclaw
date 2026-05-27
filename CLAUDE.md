# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 LEIA PRIMEIRO — Core product mechanic

**O coração deste projeto é a jornada `tenant publico → cliente`.** Antes
de tocar em qualquer arquivo de `internal/saas/`, `workspace/agents/`,
`workspace/skills/onboarding-state/`, ou `web/saas-admin/`, leia
[**docs/architecture/public-tenant-promotion.md**](docs/architecture/public-tenant-promotion.md).

TL;DR em 3 frases:

1. Visitante anônimo entra num **tenant publico** (`is_public=true`,
   sem owner_email) e conversa com **Sofia** (discovery) e depois com
   **Catarina** (deepening via WhatsApp institucional).
2. A skill `onboarding-state` cristaliza o progresso em
   `workspace/state/onboarding.json`. Quando Sofia + Catarina terminam,
   `promotion.ready=true`.
3. Admin clica **"Promover"** no painel
   (`adm.<base>/tenants/{id}`) → `POST /api/v1/tenants/{id}/promote`
   migra o tenant pra cliente real: cria owner user, gera senha, recria
   container com auth mode novo, manda email com credenciais.

Sem entender esse fluxo, decisões locais (renomear um campo, mudar uma
rota, mexer num skill) viram regressões silenciosas no funil de
cadastro. Esse é o **core revenue mechanic** — todo o resto da
plataforma existe pra servi-lo.

Componentes envolvidos (visão rápida, deep dive no doc):

- `workspace/skills/onboarding-state/` — state machine (skill)
- `workspace/agents/sofia/` + `workspace/skills/jotaduo-discovery/` — discovery
- `workspace/agents/catarina/` + `workspace/skills/aprofundar-empresa/` — deepening
- `cmd/jotaduo-wa-sidecar/` + `internal/jotaduowa/` — sidecar que dona o
  WhatsApp institucional da Jotaduo (Catarina manda outbound via HTTP HMAC;
  inbound volta via webhook → `workspace/state/jotaduo-wa-inbox.jsonl`).
  Deep dive: [docs/architecture/jotaduo-wa-sidecar.md](docs/architecture/jotaduo-wa-sidecar.md).
- `workspace/skills/enviar-whatsapp-jotaduo/` (Catarina envia) +
  `workspace/skills/verificar-respostas-jotaduo/` (Catarina lê respostas)
- `internal/saas/api/tenants_promote.go` — endpoint `/promote` (10 steps,
  inclui revoke de routing no sidecar antes do Recreate)
- `internal/saas/store/tenants.go::Promote` — DB UPDATE atômica
- `web/saas-admin/src/components/tenant/promote-tenant-card.tsx` — UI admin
- `web/backend/api/launcher_ui_visibility.go` — endpoint que serve o
  `ui-visibility.json` per-tenant pro SPA renderizar o profile correto
- `web/backend/api/jotaduo_wa_inbound.go` — endpoint que recebe webhook do
  sidecar e appende em `workspace/state/jotaduo-wa-inbox.jsonl`

**⚠️ Mexeu em `workspace/`? Rode `make sync-baseline` antes de commitar.**
O `internal/saas/api/baseline-workspace/` é auto-gerado pelo script
`scripts/sync-baseline-workspace.py` (também invocado via `go generate`).
Sem isso, novos tenants criados a partir do `default-business` workspace
ficam com versão velha do conteúdo. `make check-baseline-sync` falha o
CI se você esquecer.

## Commands

Always use `make` targets when one exists — they enforce the right build tags, ldflags, and `go generate` ordering.

```bash
make deps           # download + verify go modules (run after pulling)
make generate       # run `go generate ./...` (regenerates embedded workspace assets)
make build          # build cmd/picoclaw for the current platform (runs generate first)
make build-launcher # build picoclaw-launcher (web console). Requires web/frontend deps:
                    #   (cd web/frontend && pnpm install --frozen-lockfile)
make test           # run all tests
make vet            # static analysis (separately covers root + web/backend)
make lint           # golangci-lint + docs consistency check
make fmt            # format via golangci-lint fmt
make check          # full pre-commit: deps + fmt + vet + test + lint-docs
make lint-docs      # check Markdown layout/naming conventions only
make mem            # build cmd/membench, download LOCOMO dataset if absent, run benchmark
```

Single-test run:
```bash
go test -run TestName -v ./pkg/session/
go test -bench=. -benchmem -run='^$' ./...   # benchmarks
```

The web/ subtree has its own Makefile. Root `make test`/`make vet` recurse into it. To work inside it directly:
```bash
cd web/backend && go vet ./...
cd web/frontend && pnpm dev          # Vite dev server with hot reload
cd web/frontend && pnpm build:backend  # builds + copies dist into web/backend/dist for embed
```

Deploy: production deploys flow strictly through GitHub Actions. Push to
`main` → `.github/workflows/release-controlplane.yml` builds and pushes
5 images to GHCR (controlplane, launcher, browser-sidecar, opencrm,
jotaduo-wa) →
the VPS `picoclaw-deploy.timer` polls every 2 min and recreates only
services whose image ID changed. There is no supported path to ship
code to the prod VPS that bypasses this pipeline — do not `scp`/`rsync`
binaries onto the box and do not run `go build`/`pnpm build` there.

**Deploy gotchas (aprendidos na marra, 2026-05-27):**

1. **`docker/Dockerfile.launcher` precisa de `python3` no builder.** O
   `make build` chama `make generate` → `go generate ./...` que dispara
   o `//go:generate python3 scripts/sync-baseline-workspace.py` em
   `internal/saas/api/workspaces_bootstrap.go`. `go generate ./...` anda
   na árvore toda independente do binary que tá buildando, então ELE
   roda no build do launcher também (não só do controlplane). Sem
   python3 instalado, **todo release-controlplane.yml falha em
   cascata** — opencrm/browser-sidecar/jotaduo-wa nem chegam a buildar.
   Já está corrigido (PR #125), mas se algum Dockerfile novo usar `make`
   em vez de `go build`, aplique a mesma correção.
2. **Os compose files no VPS são estáticos.** Só `/srv/saas/picoclaw/.env`,
   os compose files e os configs de Traefik/Postgres/LiteLLM existem no
   disco — nada é git-managed. Mudanças em `docker-compose.prod.yml`
   precisam ser propagadas manualmente (SSH + heredoc) porque o
   `picoclaw-deploy.timer` só pula imagens, não YAML. Adicionar um
   serviço novo no compose **exige** ambos: PR no repo + sync manual no
   VPS.
3. **Traefik prioritiza por tamanho da rule.** Routers com rules longas
   (HostRegexp + várias condições) ganham por padrão. Quando criar um
   router novo num host que o controlplane já catch-alls
   (`adm.<base>`, `*.<base>`), set `priority=200` explícito no label —
   senão o router específico é silenciosamente sobrescrito pelo
   genérico. Cair na SPA do controlplane em vez do serviço novo é o
   sintoma.

Local dev: spin the SaaS stack up on your dev machine with
`docker compose -f docker/saas/docker-compose.yml -f docker/saas/docker-compose.dev.yml --env-file .env up -d --build`
(uses `traefik.dev.yml`, localhost domains, no Let's Encrypt). PS1
launchers in `scripts/dev-*.ps1` cover the picoclaw launcher binary on
Windows. Rebuild images locally with `docker compose build <service>`
when you need to test the same image GHA will publish.

Pre-PR: **`make check`** must pass locally. See `.golangci.yaml` for enabled linters.

## Build tags

`GO_BUILD_TAGS` defaults to `goolm,stdjson`:
- `goolm` — pure-Go Olm crypto for Matrix channel. Dropped for `mipsle` builds (`GO_BUILD_TAGS_NO_GOOLM`).
- `stdjson` — use stdlib `encoding/json` instead of a heavier alternative; reduces binary size on resource-constrained targets.
- `whatsapp_native` — opt-in tag for the whatsmeow-based WhatsApp channel. Adds ~30MB to the binary, so it's gated behind `make build-whatsapp-native` rather than the default.

When adding a new channel that links heavy native code, follow the same pattern: build tag + a dedicated `make build-*` target that compiles across the platform matrix.

## The two binaries

This repo produces two distinct executables that share most of `pkg/`:

| Binary | Source | Purpose |
|---|---|---|
| `picoclaw` | `cmd/picoclaw/` | CLI: `agent` (one-shot query), `gateway` (long-running multi-channel bot), `onboard`, `auth`, `model`, `skills`, `mcp`, `status`. |
| `picoclaw-launcher` | `web/backend/` | HTTP server on :18800 wrapping the gateway, embedding the React/Vite SPA from `web/frontend/dist`. Acts as a desktop-app-style web console. |

The launcher embeds the frontend via `//go:embed` against `web/backend/dist`, populated by `(cd web/frontend && pnpm build:backend)`. `make build-launcher` runs both steps. There is a `.gitkeep` in `web/backend/dist/` so the embed directive stays valid before any frontend build — don't delete it.

## $PICOCLAW_HOME and runtime state

Every runtime artifact lives under one configurable directory:

- `$PICOCLAW_HOME` (env) overrides; default `~/.picoclaw` (logic in `pkg/config/envkeys.go`).
- `$PICOCLAW_CONFIG` overrides the config file path independently; default `$PICOCLAW_HOME/config.json`.

Inside that directory you'll find `config.json`, `.security.yml` (permissions/access control, loaded separately), `auth.json` (OAuth credentials per provider), `workspace/` (sessions, memory, skills), `state/state.json` (atomic-write last-channel/chat tracker), `dashboardauth.db` (single-row SQLite holding the bcrypt hash for the launcher login), and per-channel state subdirs (e.g. `whatsapp/store.db` for whatsmeow's session SQLite, `channels/weixin/sync/`).

Core Picoclaw runtime remains single-home and isolated: one `$PICOCLAW_HOME` is one instance. The SaaS control plane in `cmd/picoclaw-saas` builds multi-tenancy around that boundary by provisioning one launcher container and one bind-mounted home per tenant, then routing public access through a central RBAC gateway.

## Template runtime business rules

For the current deployment, the live runtime workspace is `/root/.picoclaw/workspace`, not the repo-local `workspace/`. The applied template flow is dashboard editor -> backend apply -> runtime files -> gateway reload -> agent registry.

Template apply writes these artifacts:

- `AGENT.md`: main prompt plus frontmatter such as model, skills, and tool allowlists.
- `SOUL.md`: identity, personality, values, tone, and language.
- `behavior.json`: hard business switches and filters used by channels and the agent loop.
- `agent_config.json`: full editor payload for dashboard round-trip; not the primary runtime prompt source.
- `config.json` `agents.defaults.active_template_id`: selected template id for dashboard state.

The launcher agent editor supports multiple runtime agents through the existing `agents.list` model. `main` remains implicit when `agents.list` is empty. Applying a template with `agent_id=main` writes the default workspace and updates `agents.defaults.active_template_id`; applying a template with any other normalized agent id writes a sibling workspace such as `workspace-sales`, creates/updates that entry in `agents.list`, and does not overwrite the global active template marker.

Runtime source of truth: prompt and frontmatter come from `AGENT.md`; identity/style comes from `SOUL.md`; hard filters come from `behavior.json`. `agent_config.json` is for editing continuity. If the rendered prompt contains both a company name and a different presentation name, treat that first as payload data mismatch, not renderer drift.

Template skills are curated, not bulk-enabled. The default business templates may recommend only skills that exist in the seed and are suitable for tenant-facing agents: atendimento, clínica, loja, vendas, suporte, internal/compliance, privacy, and routing. `memory-and-knowledge-check` is an optional high-risk audit skill, not a default always-on skill. Technical/operator skills such as `agent-browser`, `github`, `hardware`, `skill-creator`, `summarize`, `tmux`, and `weather` stay available for dev/operator profiles but should not appear in a standard tenant's default recommended skill set.

When applying a template, the backend rejects any enabled skill that the loader cannot resolve and drops disabled unknown skill entries. This prevents `AGENT.md` frontmatter from referencing capabilities that the runtime agent cannot load.

Current live template state to preserve unless the dashboard explicitly changes it:

- Active template: `atendente-geral`.
- Last live template file write: `2026-05-16 03:46:11 +0200`.
- `master_enabled=true`, `respond_in_dm=true`, `respond_in_groups=false`, and `group_mention_only=true` are the current business state for the live standalone seed.

Behavior enforcement is split deliberately:

- `pkg/channels` applies cheap inbound filters before publishing to the bus: master switch, DM/group response flags, group mention rule, keyword trigger, ignore bot/forwarded/self, media type gates, and max media size.
- `pkg/agent` applies session-aware rules: business hours and out-of-hours reply, outbound-only mode, max messages per session, throttle/cooldown, PII masking, and handoff keyword events.

For multi-agent deployments, channel-layer behavior lookup must resolve the same `agents.dispatch.rules` route that the agent loop will use. Do not fall back to the default agent's `behavior.json` for routed messages; otherwise secondary agents can be configured in the dashboard but their hard DM/group/media filters are bypassed at channel ingress.

Gateway readiness rule: `/health` means the process is alive; `/ready` means the shared channel HTTP server is ready. The channel manager must mark the shared `health.Server` not-ready during setup/stop/reload and ready only after channels start or reload successfully. See `docs/architecture/template-runtime-business-rules.md` for the full contract and regression commands.

## SaaS workspaces (tenant content)

Every tenant is seeded from a **Workspace** — a single, admin-managed
directory under `PICOCLAW_WORKSPACE_DIR` (default
`/srv/picoclaw-workspaces/<slug>/`). This replaces the legacy three-layer
overlay system (`TenantTemplateDir` + `LauncherProfile.SeedPath` +
`AutoProvisionWorkspaceDir`); migration `0013_drop_launcher_profiles.sql`
retired the old tables. Deep dive: `docs/architecture/workspaces.md`.

Each workspace contains three subdirs the admin manages via
`adm.<base>/workspaces`:

- `home/` — bind-mounted into the tenant container at `/root/.picoclaw`.
  Contains `config.json` (with `${LITELLM_KEY}`, `${LITELLM_URL}`,
  `${TENANT_ID}` placeholders), `.security.yml`, `workspace/AGENT.md`,
  `workspace/SOUL.md`, `workspace/behavior.json`, agents/, skills/,
  memory templates, etc. Files NEVER in `home/`: `dashboardauth.db`
  (provisioner generates), `launcher_policy.json` (provisioner writes
  from the workspace's `role_policy_json` DB column), `workspace/sessions/`,
  `workspace/whatsapp/`, `state/`, `runtime-user-env/` (all runtime state).
- `frontend-src/` — editable React source per workspace (same stack as
  `web/frontend/`, but each workspace is a divergent fork). Not mounted
  into the tenant.
- `frontend-dist/` — compiled vite output, bind-mounted **read-only**
  into the tenant at `/var/lib/picoclaw-frontend`. The launcher's
  `web/backend/embed.go` honors `PICOCLAW_FRONTEND_DIST_DIR` and serves
  from this bind when it has a non-empty `index.html`; otherwise falls
  back to the embedded dist.

Two flags on each workspace row drive selection:

- `is_default_auto` (DB-unique) — auto-provisioner uses this one when
  Clara qualifies a lead. Without one marked, `AutoProvisioner.Run`
  fails fast with a clear error (no fallback).
- `is_available_manual` — appears in the admin "New tenant" dropdown.
  Set to `false` for workspaces dedicated to automation (e.g. the
  onboarding tenant slug).

Provisioning is a fixed five-step flow in `Provisioner.runProvision`:
mkdir volume → `CopyWorkspaceHome` (single authoritative copy) → optional
`SeedDashboardPassword` → generate LiteLLM virtual key +
`SubstituteConfigPlaceholders` → `WriteLauncherPolicy` from
`role_policy_json` → docker create+start with two bind-mounts. `buildSpec`
re-attaches the frontend bind on every `Recreate` / `lifecycle.Restart` so
visual customizations survive container recreation.

### Tenant type → ui-visibility profile (PR #104, 2026-05-25)

The "New tenant" wizard is a two-step picker:

1. Pick a **type** card: `publico`, `admin`, or `cliente` (default).
2. Fill the form (owner_email is hidden for `publico` since there's no human owner).

`resolveUIProfile(tenant_type)` in `internal/saas/api/tenants.go` maps the
admin vocabulary to the runtime `tenant.UIVisibilityProfile` enum:

| `tenant_type` | `active_profile` written | `IsPublic` | Dashboard password |
|---|---|---|---|
| `publico` | `public` | `true` | skipped (`SkipDashboardPassword`) |
| `admin` | `admin` | `false` | seeded |
| `cliente` / `""` | `tenant` | `false` | seeded |

The provisioner calls `SetUIVisibilityActiveProfile(volumePath, profile)`
right after `CopyWorkspaceHome`, rewriting `ui-visibility.json` in the
volume root so the frontend's `useUIVisibility` hook returns the correct
profile from the first page load. Existing tenants provisioned before
this feature have `active_profile` blank → use
`scripts/maintenance/backfill-ui-visibility.sh` (default `"tenant"`) to
backfill. `waiting` is a separate profile set programmatically when the
tenant has done discovery but is awaiting operator liberation (see
`handleAdminTenantDiscoveryLiberate`).

The single-purpose `POST /tenants/onboarding/bootstrap` endpoint was
removed in PR #104 — the public onboarding tenant is now created through
the normal wizard with `tenant_type=publico` like any other tenant.

### Strict config mode for SaaS tenants (PR #104)

The provisioner injects `PICOCLAW_CONFIG_STRICT=true` into every tenant
container. `pkg/config.IsStrictConfigMode()` then gates two behaviors:

- `loadConfig` starts from an empty `Config{}` instead of `DefaultConfig()`
  → no leak of the standalone launcher's 25-provider `model_list` into
  tenant config.
- The three post-migration `defer SaveConfig(...)` paths in
  `pkg/config/config.go` (versions 0→1, 1→2, 2→3) are skipped on disk;
  migration happens in-memory only. Workspace `config.json` stays
  authoritative.

This closes the bug where `default-business` workspace had
`model_name: "default"` and the first tenant boot silently rewrote it to
`"openrouter-gpt-5.4"` (the first "real" model in DefaultConfig).

To enforce upload-time validity, `internal/saas/api/workspaces_upload.go`
runs `validateWorkspaceConfigSemantics` on every ZIP:

- **Blocks upload** when `home/config.json` has empty `model_list`,
  empty `model_name`/`provider` in any entry, or
  `agents.defaults.model_name` doesn't resolve to a `model_list` entry.
- **Warns (but allows)** missing optional fields; the admin upload
  dialog surfaces warnings in an amber panel.
- `is_raw=true` bypasses the validator (operator explicitly opting out).

Role policy is enforced twice: the SaaS controlplane blocks proxied
tenant API calls before forwarding to `tenant-<id>:18800`, and the
launcher blocks local trusted-gateway requests with the same feature
policy. The launcher frontend uses `/api/launcher/policy` only for
navigation/UX; backend enforcement is the source of truth.

Per-workspace frontend compile: admin clicks "Compilar frontend" →
`POST /api/v1/workspaces/{id}/frontend/build` → spawns
`docker run --rm node:24-alpine3.23` with bind-mounts for `frontend-src/`
and `frontend-dist/`, runs `pnpm install --frozen-lockfile && pnpm vite
build`. 5-minute hard timeout; combined log tail capped at 64 KiB and
stored in `workspaces.frontend_build_log` for the admin UI to display.

Clone (tenant → tenant): preserves runtime state via `CopyVolumeRaw`,
generates a fresh LiteLLM key, then `RewriteConfigLiteLLMKey` parses the
cloned `config.json` and replaces every `model_list[].api_key` so the
clone doesn't burn the source tenant's LiteLLM budget. Inherits
`src.WorkspaceID` so the frontend bind survives.

Current production state as of `2026-05-21`:

- Live SaaS host: `155.138.210.187` (Vultr Ubuntu 24.04, Docker 29.5.1).
  Bootstrap procedure: `docs/operations/saas-vps-deploy.md`.
- Admin domains: both `admin.jotaduo.com` and `adm.jotaduo.com` resolve
  to the controlplane.
- Reverse proxy is **Traefik v3.5** with `picoclaw-tenant-router.service`
  writing a concrete `Host(<sub>.<base>)` router per running tenant into
  `traefik/dynamic/tenants.yml` so Let's Encrypt can issue certs.
- Tenant containers run `picoclaw-launcher:latest` with
  `PICOCLAW_AUTH_MODE=trusted_gateway`, `traefik.enable=false`, and
  receive signed trusted headers from the controlplane.
- Auto-provision is enabled (`PICOCLAW_SAAS_AUTO_PROVISION=true`).
  Operator must keep at least one workspace marked `is_default_auto`
  via the admin UI — there is no env-var fallback.
- Workspaces directory `/srv/picoclaw-workspaces` is bind-mounted
  read-write into the controlplane container; edits via the admin
  propagate to NEW tenants automatically (existing tenants need
  re-provision or manual copy).

Sofia public-onboarding contract (must not regress when touching `internal/saas/api/company_intakes_*.go`):

- `mark_qualified` fires DURING the chat SSE flow but DOES NOT provision — it only sets `qualified_at` on the intake row. Contact email is empty at that point.
- `POST /api/v1/public/company-intakes/{id}/submit` is where `AutoProvisioner.Run` is actually invoked, AFTER ClaraFinalize collected `contact_email` and `contact_whatsapp`. The response carries `tenant_provisioned`, `url`, `login_mode` (always `"password"` when Supabase is on), `check_email: true`, and `initial_password` — the SSE handler emits the password to the chat AND signals that an email also went out with the magic link included.
- `ClaraMaxTurns` defaults to 120 (`~60 user turns`). The frontend warns at 50 / hard-stops at 56 to give a buffer before the backend cap. Don't reintroduce a lower cap without bumping both.
- Both Clara (public) and Sofia (workspace persona inside tenant) exist. Do not collapse them — `internal/saas/clara/clara_system.txt` is the public marketing voice, `workspace/agents/sofia/AGENT.md` is the in-tenant onboarding agent that takes over post-provision.
- **Public onboarding tenant** (`feat/public-onboarding-tenant`, mostly merged): the legacy in-controlplane Clara is being replaced by a Picoclaw tenant flagged `tenants.is_public=true`. Ingress goes through `pkg/channels/publicweb/` (anonymous SSE), bypasses Supabase JWT on `/api/public/chat*` only, and routes skill callbacks (`onboarding-mark-qualified`, `onboarding-submit-intake`) back to the controlplane via HMAC-authenticated `POST /api/v1/onboarding-callback`. The dedicated bootstrap endpoint + `scripts/provision-onboarding-tenant.sh` were removed in PR #104 — provision the singleton public tenant through the normal wizard with `tenant_type=publico` instead. Architecture deep-dive: `docs/architecture/public-onboarding-tenant.md`. Frontend cutover (Phase 10) is still a stub — `VITE_USE_ONBOARDING_TENANT` flag exists but the real fetch path still hits the legacy `/api/v1/public/company-intakes/*` endpoints until an SSE event-shape adapter lands. The legacy `company_intakes*.go` chain stays in place until Phase 11 deletes it after 1-2 weeks of stable parallel operation.

### Admin panel embutido em `web/frontend`

O caminho essencial de operação de tenants (list, create, clone, suspend/resume/restart, rotate password) vive embutido no `picoclaw-launcher` em `web/frontend/src/routes/admin/*`. Ele NÃO substitui `web/saas-admin` — fluxos periféricos (audit, users, intakes públicos, CRM, AgentEdit, SkillsList, AgentSettings, AcceptInvite, ServerHealth, **Workspaces**) seguem em `adm.<dominio>`.

- **Sem login separado.** O admin entra pelo `/launcher-login` do próprio launcher (mesmo cookie de dashboard). As rotas `/admin/*` ficam dentro do `AppLayout` normal (sidebar + header). Não há `/admin/login`, `AdminGuard` cross-subdomain, cookie de controlplane no browser, ou CORS.
- **Proxy backend**: `web/backend/api/saas_proxy.go` registra `/api/admin/saas/*` no launcher, que repassa para `<PICOCLAW_SAAS_BASE_URL>/api/v1/*` no controlplane usando credenciais armazenadas em arquivo 600 (`/etc/picoclaw/saas-admin.env`). Login é lazy + retry em 401 (`saas_client.go`).
- **Gating**: `GET /api/launcher/policy` retorna `is_saas_admin: true` quando o launcher tem `PICOCLAW_SAAS_ADMIN_MODE=true` + base/email/password + role efetivo é `platform_admin`. O sidebar mostra o grupo "Administração" apenas quando essa flag é verdadeira, e `AdminGuard` (`web/frontend/src/components/admin/AdminGuard.tsx`) confirma localmente sem qualquer chamada externa.
- **Clone tenant -> tenant**: `POST /api/v1/tenants/{id}/clone` -> `Provisioner.CloneFromTenant`. Cópia raw da volume via `CopyVolumeRaw` em `internal/saas/tenant/template.go` (blocklist mínimo: `*.pid`, `*.sock`, `*.lock`, `*.db-wal`, `*.db-shm`, `*.db-journal`, `logs/`, `runtime-user-env/`). Preserva segredos, OAuth, dashboardauth.db, sessions, memory. Pula `SeedDashboardPassword` (senha do origem viaja junto). LiteLLM key é regenerada porque o `key_alias` é o tenant id. Sanity checks pós-clone via `Provisioner.RunPostCloneChecks` em `internal/saas/tenant/sanity.go`.
- **Endpoints controlplane**: `POST /api/v1/tenants/{id}/clone` e `GET /api/v1/tenants/{id}/sanity` (ambos `requirePlatformAdmin`).
- Contrato detalhado em `docs/architecture/admin-in-launcher.md`.

## Configuration

`pkg/config/config.go` defines a single `Config` struct with ~15 fields (Isolation, Agents, Session, Channels, ModelList, Gateway, Events, Hooks, Tools, Voice, …). Each top-level field has env-var overrides via `caarlos0/env` struct tags (e.g. `PICOCLAW_CHANNELS_TELEGRAM_TOKEN`, `PICOCLAW_AGENTS_DEFAULTS_MODEL_NAME`). The exhaustive list is in `pkg/config/envkeys.go`.

LLM credentials in `ModelList[].APIKey` accept three forms (resolved in `pkg/credential/credential.go`): plaintext (`sk-…`), file (`file://name.key` reading from `$PICOCLAW_HOME/name.key`), or AES-256-GCM encrypted (`enc://<base64>`, decrypted via `PICOCLAW_KEY_PASSPHRASE` env). Don't store plaintext keys in `config.json` for anything beyond local dev.

All provider configs support `api_base` (`pkg/providers/factory_provider.go` → `ResolveAPIBase`). This is the override point for swapping in a LiteLLM proxy or any OpenAI-compatible endpoint without touching code.

## Channel model

Channels are pluggable adapters under `pkg/channels/<name>/`. Every channel implements the `Channel` interface in `pkg/channels/interfaces.go` and embeds `BaseChannel` (`pkg/channels/base.go`) for the running-state flag, allow-list logic, message-length splitting, media store handle, and event logging.

Key invariant: **a channel keeps stateful connections** (Telegram long-poll, WhatsApp websocket, Matrix sync, IRC TCP, …). The `pkg/channels/manager.go` orchestrator owns lifecycle (`Start`/`Stop`) and routes inbound messages to the agent and outbound responses to the right channel. When adding a channel, mirror `BaseChannel` usage from a similar existing one (Telegram for HTTP-poll; Matrix for websocket-like) rather than re-implementing the boilerplate.

Sender identity is canonicalized as `"platform:id"` strings (`pkg/identity/identity.go`). Allow-list matching uses `MatchAllowed(sender, allowEntry)` — don't compare raw IDs.

## Agent / session / memory

- `pkg/agent/instance.go` defines `AgentInstance` with its own `Workspace`, `RestrictToWorkspace`, `AllowReadOutsideWorkspace`, tool registry, and session store.
- Sessions persist as JSONL via `pkg/memory/jsonl.go` (one file per session key, plus `<key>.meta.json`). Keys with `:`, `/`, `\` are sanitized for filename safety. Legacy `pkg/session/session_store.go` interfaces still exist for migration paths.
- Memory store supports vector embeddings for RAG; consumers go through the `SessionStore` interface so the JSONL backend can be swapped without touching call sites.

## Subprocess isolation

`pkg/isolation/runtime.go` sandboxes *child processes* (the `exec` tool, CLI providers like `claude-cli`/`codex-cli`, MCP stdio servers, hooks) — **not** the main picoclaw process itself. It's opt-in (`config.isolation.enabled`) and platform-specific: bubblewrap (`bwrap`) on Linux, restricted tokens + low integrity + Job Object on Windows, no-op on macOS. The `runtime-user-env/` subtree inside `$PICOCLAW_HOME` holds redirected `HOME`/`TEMP`/etc. that the sandboxed children see.

When implementing a new tool that shells out, route the `exec.Cmd` through `isolation.Runtime` rather than building it directly.

## Cross-platform build matrix

`make build-all` targets nine triples including some quirky ones. Two gotchas to be aware of when touching the Makefile or adding deps:

- **MIPS LE**: requires `GOMIPS=softfloat` and the `goolm` tag stripped. After `go build`, `PATCH_MIPS_FLAGS` rewrites four bytes at offset 36 of the ELF to set the NaN2008 flag — kernels like Ingenic X2600 reject the binary otherwise. Don't remove this dd invocation.
- **loong64**: `creack/pty@v1.1.9` ships no `ztypes_loong64.go`; `PTY_PATCH_LOONG64` writes a minimal one into the module cache. When bumping the pty dep, verify the patch is still needed.

`build-android-bundle` produces a universal zip with the binaries renamed to `lib*.so` so they sit inside a `jniLibs/arm64-v8a/` directory of the Android wrapper app — the names matter for the Android packaging system.

## When working on this codebase

- The version metadata (`Version`, `GitCommit`, `BuildTime`, `GoVersion`) is injected via `-ldflags -X github.com/sipeed/picoclaw/pkg/config.Var=…`. If you add a new metadata field, register it in `pkg/config/buildinfo.go` and add the `-X` flag to every relevant `go build` invocation in the Makefile.
- AI-assisted contributions are first-class (see `CONTRIBUTING.md`): every PR must declare the AI involvement level, and reviewers apply extra security scrutiny to file-path handling, command execution, and channel handlers (commit `244eb0b` is cited as a real prior sandbox-escape incident).
- The `docs/` tree has its own consistency lint via `scripts/lint-docs.sh` (called from `make lint-docs` and `make lint`); run it after adding or moving Markdown files.
- SaaS tenancy now lives in this repo under `cmd/picoclaw-saas`, `internal/saas`, `web/saas-admin`, and `docker/saas`. Changes to Picoclaw's home-dir layout, dashboard auth schema (`web/backend/dashboardauth/sql.go`), launcher CLI flags, or trusted gateway auth headers can break tenant provisioning — coordinate those surfaces with `docs/architecture/saas-tenancy.md`.
