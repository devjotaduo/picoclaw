# Public Tenant Promotion — coração do produto

> **Leia isto primeiro se você está começando neste projeto.** A promoção
> tenant publico → cliente é o mecanismo central da plataforma; tudo o
> mais (workspaces, agentes, channels, billing) existe pra servir esse
> fluxo. Sem entender essa jornada, decisões locais ficam fora de
> contexto.

## TL;DR em 3 frases

1. Visitante anônimo entra num **tenant publico** (`is_public=true`,
   `active_profile=public`, sem owner_email) e conversa com **Sofia** que
   conduz discovery do negócio, depois com **Catarina** que aprofunda os
   detalhes técnicos via WhatsApp institucional.
2. Quando Sofia + Catarina terminam, o arquivo
   `workspace/state/onboarding.json` no volume do tenant marca
   `promotion.ready=true`.
3. O admin clica **"Promover"** no painel
   (`adm.<base>/tenants/{id}`) → `POST /api/v1/tenants/{id}/promote`
   migra o tenant pra **cliente normal**: cria owner user, gera senha,
   flipa `is_public=false`, recreate do container com auth mode novo,
   manda email com credenciais.

## Por que essa arquitetura existe

**Problema de produto:** ninguém preenche formulário longo de cadastro
pra um SaaS de IA. Mas a equipe de agentes (Clara, Marcos, Camila…)
precisa de muita info sobre a empresa pra atender bem sem inventar.
A conversa com Sofia substitui o formulário — o dono passa por discovery
sem perceber que está se cadastrando.

**Solução técnica:** o cadastro vira um **tenant funcional desde a
primeira interação** (`is_public=true`), com a equipe inteira já
disponível (mesmo que escondida pela ui-visibility). Sofia/Catarina
preenchem a memória, e a "promoção" é só a mudança de modelo de auth +
captura dos dados que faltavam pra criar a conta real.

Isso resolve dois problemas em um:
- **Conversão:** zero fricção pra começar (URL pública → chat)
- **Qualidade:** quando promove, a memória já está rica — clientes
  novos não passam pelo vazio inicial

## Estado da implementação (2026-05-29)

Status atual:

| Item | Status | PR |
|---|---|---|
| state machine + Sofia/Catarina | ✅ mergeada | #113 |
| `POST /tenants/{id}/promote` backend | ✅ mergeada | #114 |
| UI admin (PromoteTenantCard) | ✅ mergeada | #115 |
| jotaduo-wa sidecar (5 fatias + 2 follow-ups) | ✅ deployado em prod | #118-#126 |
| bridge automático Sofia→Catarina | ✅ implementada via cron workspace | — |

Fluxo end-to-end funciona manualmente e via WhatsApp institucional. A
bridge automática Sofia→Catarina roda no workspace pelo job
`onboarding-bridge-sofia-catarina`: quando Sofia conclui discovery, o
cron chama `workspace/skills/bridge-flow/scripts/run.sh`, registra a
tentativa, envia a primeira mensagem da Catarina e só grava
`deepening.first_contact_at` depois do envio WhatsApp retornar sucesso.
Rafael/admin ficam como fallback operacional quando faltam telefone,
credenciais do sidecar ou WhatsApp institucional ativo.

### Como Catarina alcança o lead (sidecar jotaduo-wa)

Catarina não tem WhatsApp próprio dentro do tenant — ela usa o
**WhatsApp institucional da Jotaduo** via um sidecar dedicado
(`docker compose service jotaduo-wa`). Deep dive técnico:
[jotaduo-wa-sidecar.md](jotaduo-wa-sidecar.md).

Resumo:
- Sidecar é o único processo com o pareamento whatsmeow (operador
  escaneia QR uma vez em `https://adm.<base>/jotaduo-wa/pair?token=...`)
- Tenant publico recebe `JOTADUO_WA_URL` + `JOTADUO_WA_HMAC_SECRET`
  injetados pelo provisioner. Skill `enviar-whatsapp-jotaduo` POSTa no
  sidecar.
- Respostas do lead voltam via webhook `/api/launcher/jotaduo-wa-inbound`
  e são appendadas em `workspace/state/jotaduo-wa-inbox.jsonl` —
  Catarina lê com `verificar-respostas-jotaduo --consume`.
- Na promoção, `/promote` revoga a routing no sidecar E o `Recreate`
  retira `JOTADUO_WA_HMAC_SECRET` do container do cliente. Defesa em
  duas camadas — cliente promovido perde acesso ao número institucional.

### Qual modelo Sofia/Catarina rodam

Por default, `config.json` do template `default-business` aponta `default`
pra `claude-sonnet-4-5` via OpenRouter (pay-per-token na chave do
operador). Alternativas validadas em prod:

- **claude-cli (subscription do operador)** — provider `claude-cli`,
  model `sonnet`. Usa o binário `claude` instalado no launcher container
  com OAuth bind-mountado de `/etc/picoclaw/claude-auth`. Zero custo
  por token (subscription Max do operador absorve). Setup operacional
  em [docs/operations/claude-cli-provider.md](../operations/claude-cli-provider.md).
- **groq-qwen3-32b** — barato (~$0.0002 por mensagem curta), super
  rápido, MAS rejeita prompts > 6K tokens no Groq free tier. Sofia
  tem prompt ~11K, então **não funciona** sem upgrade no plano Groq.
  Pra outros tenants com prompt menor pode servir.
- **anthropic-api direto** — adiciona `ANTHROPIC_API_KEY` ao LiteLLM
  e usa `anthropic/claude-sonnet-4-5`. Mais caro que OpenRouter (~50%
  premium) mas sem aggregator markup.

Tenant escolhe via `config.json::model_list[0].provider+model`. Pode ser
trocado per-tenant sem mexer no template — basta editar o config no
volume e recriar o container.

## A jornada — diagrama da feature

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. CRIAÇÃO DO TENANT PUBLICO                                       │
│  Admin abre adm.<base>/tenants/new → escolhe card "Público" →       │
│  preenche display_name + subdomain (SEM owner_email — Sofia coleta) │
│  → POST /tenants {tenant_type: "publico"}                           │
│     ↓                                                                │
│  Provisioner.Create cria container com:                              │
│    - is_public=true                                                  │
│    - auth_backend="local" (sem dashboardauth.db owner)               │
│    - PICOCLAW_AUTH_MODE=trusted_gateway                              │
│    - PICOCLAW_ALLOWED_CHANNELS=whatsapp_native,pico                  │
│    - ui-visibility.json::active_profile="public"                     │
│  → tenant URL: https://<sub>.jotaduo.com                             │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  2. DISCOVERY (Sofia, no chat publico anônimo)                      │
│  Visitante acessa <sub>.jotaduo.com → launcher SPA carrega →        │
│  active_profile=public esconde toda navegação exceto chat →         │
│  Sofia carrega skill jotaduo-discovery + onboarding-state.init      │
│                                                                      │
│  Fase 1-7: conversa consultiva sobre o negócio                       │
│  Fase 7.5: captura "nome + email + WhatsApp do dono"                 │
│    → exec onboarding-state.set_owner(name, email, whatsapp)          │
│  Fase 8: grava workspace/memory/empresa.md (via delegate Rafael)    │
│  Fase 8b.5: exec onboarding-state.mark_discovery_done(segment, ...)  │
│                                                                      │
│  Resultado: workspace/state/onboarding.json com:                     │
│    phase = "discovery_done"                                          │
│    discovery.completed_at = now                                      │
│    owner_captured.{name, email, whatsapp} = preenchidos              │
│    promotion.blocked_by = ["deepening_incomplete: <5 áreas>"]        │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  3. DEEPENING (Catarina, via WhatsApp institucional da Jotaduo)     │
│  Pré-requisito: admin tem whatsapp_jotaduo_outbound configurado     │
│  Trigger atual: cron workspace onboarding-bridge-sofia-catarina       │
│                                                                      │
│  Catarina manda 1ª mensagem ao número capturado por Sofia:           │
│  "Oi <nome>, sou a Catarina. Sofia já fez o discovery — agora vou   │
│   te perguntar uns detalhes técnicos em sessões curtas, 10-15min,   │
│   uma por dia, pra equipe não inventar nada. Posso te chamar?"      │
│                                                                      │
│  5 sessões, 1 por dia, fechando uma área cada:                       │
│    - equipe: quem faz o quê, horários, ferramentas                   │
│    - casos-excecao: VIPs, fluxos especiais                           │
│    - faq: perguntas específicas do nicho                             │
│    - historico: o que já deu errado antes                            │
│    - regras-tacitas: políticas não escritas                          │
│                                                                      │
│  Cada área fechada: exec onboarding-state.mark_area_complete(area)   │
│  Quando a 5ª fecha: state.promotion.ready = true (automático)        │
│                                                                      │
│  Escape hatch: admin pode forçar via mark_ready_for_promotion        │
│  com motivo logado (cliente simples, sem necessidade de aprofundar). │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  4. PROMOÇÃO (Admin, no painel)                                     │
│  Admin abre adm.<base>/tenants/<id> →                                │
│  PromoteTenantCard renderiza (porque is_public=true):                │
│    - Badge "Pronto pra promover" (emerald)                           │
│    - Mostra email/nome/WhatsApp capturado por Sofia                  │
│    - Mostra 5/5 áreas cobertas                                       │
│  Admin clica "Promover" → modal pré-preenchido com email             │
│  Submete → POST /api/v1/tenants/<id>/promote {}                      │
│                                                                      │
│  Backend (handlePromoteTenant) executa em 10 steps:                  │
│    1. Get tenant; reject se !is_public (409)                         │
│    2. Read /srv/saas/tenants/<id>/workspace/state/onboarding.json    │
│    3. Validate promotion.ready=true (ou req.force=true)              │
│    4. Resolve owner email (state OR override) + re-validate          │
│    5. DB: Tenants.Promote(id, ownerEmail, "launcher")                │
│       + Users.EnsureInvited(email) → owner user                      │
│       + Memberships.Upsert(owner.id, tenant.id, tenant_owner)        │
│    6. FS: SetUIVisibilityActiveProfile(volume, UIProfileTenant)      │
│       + GeneratePassword() + SeedDashboardPassword(volume, pwd)      │
│    7. Direct file write: state.json::promotion.promoted_at = now     │
│    8. Provisioner.Recreate — container reboots com env novo:         │
│       PICOCLAW_AUTH_MODE muda trusted_gateway → launcher native      │
│       PICOCLAW_ALLOWED_CHANNELS permanece no default whatsapp+pico   │
│       launcher-auth.db (já seeded) é lido pelo launcher pra auth     │
│    9. Mailer.SendCredentialsEmail (best-effort, goroutine)           │
│    10. Audit log: tenant.promote                                     │
│                                                                      │
│  Resposta: {tenant_id, url, owner_email, initial_password, ...}      │
│  UI: dialog não-fechável com CopyableField pra URL + senha          │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  5. CLIENTE NORMAL                                                  │
│  Owner recebe email com URL + login + senha →                        │
│  Acessa https://<sub>.jotaduo.com → vê tela de login real            │
│  (não mais chat anônimo) → autentica → painel completo:              │
│    - Sidebar visível (Chat, Agentes, WhatsApp, etc — tenant profile) │
│    - Memória preenchida (empresa.md + 5 áreas via Catarina)          │
│    - Equipe pronta pra operar sem inventar                           │
│    - Histórico da conversa anônima do discovery preservado           │
└─────────────────────────────────────────────────────────────────────┘
```

## Componentes envolvidos — onde mexer no quê

| Camada | Arquivo / Diretório | Função |
|---|---|---|
| **Frontend (SPA do launcher)** | `web/frontend/src/api/ui-visibility.ts` | Fetcha `/api/launcher/ui-visibility` e aplica o profile (esconde sidebar pra public, mostra full pra tenant) |
| **Backend launcher** | `web/backend/api/launcher_ui_visibility.go` | Serve `home/ui-visibility.json` do volume pro SPA; em checkout local cai para `workspace/ui-visibility.json` |
| **Backend controlplane — provisioner** | `internal/saas/tenant/provisioner.go` | `Create` (cria tenant), `Recreate` (rebuilda container env), `SetUIVisibilityActiveProfile` |
| **Backend controlplane — handler create** | `internal/saas/api/tenants.go::handleCreateTenant` | Resolve `tenant_type` → UIProfile; público pula `EnsureInvited` / `SendCredentialsEmail` (PR #108) |
| **Backend controlplane — handler promote** | `internal/saas/api/tenants_promote.go::handlePromoteTenant` | Endpoint da promoção (10 steps) (PR #114) |
| **Backend controlplane — endpoint state** | `internal/saas/api/tenants_promote.go::handleGetTenantOnboardingState` | Expõe state.json pra UI consumir (PR #115) |
| **Store DB** | `internal/saas/store/tenants.go::Promote` | UPDATE atômica: is_public=false + owner_email + auth_backend |
| **State machine no workspace** | `workspace/skills/onboarding-state/` | Skill Python que escreve `workspace/state/onboarding.json` (PR #113) |
| **Discovery agent** | `workspace/agents/sofia/AGENT.md` + `workspace/skills/jotaduo-discovery/` | 8 fases + Phase 7.5 captura credenciais + Phase 8b.5 marca discovery_done |
| **Bridge Sofia→Catarina** | `workspace/cron/jobs.json` + `workspace/skills/bridge-flow/scripts/run.sh` | Cron determinístico que dispara Catarina quando Sofia conclui discovery e WhatsApp institucional está pronto |
| **Deepening agent** | `workspace/agents/catarina/AGENT.md` + `workspace/skills/aprofundar-empresa/` | 5 áreas via WhatsApp institucional, marca area_complete por área |
| **UI admin** | `web/saas-admin/src/components/tenant/promote-tenant-card.tsx` | Card renderizado em TenantDetail quando is_public=true (PR #115) |

## O arquivo de estado — `workspace/state/onboarding.json`

Single source of truth da jornada. Escrito pela skill `onboarding-state`,
lido pelo backend `/promote` e pela UI admin.

```json
{
  "phase": "discovery_in_progress | discovery_done | deepening_in_progress | ready_for_promotion | promoted",
  "discovery": {
    "started_at": "2026-05-26T22:30:00Z",
    "completed_at": null,
    "segment": "clinica | restaurante | varejo | servicos | beleza | ...",
    "summary": "Resumo executivo do discovery (gerado pela Sofia)",
    "agent": "sofia"
  },
  "deepening": {
    "started_at": null,
    "areas_covered": ["equipe", "casos-excecao"],
    "areas_required": ["equipe", "casos-excecao", "faq", "historico", "regras-tacitas"],
    "completed_at": null,
    "agent": "catarina",
    "forced_completion_reason": null
  },
  "owner_captured": {
    "name": "Eduardo Silva",
    "email": "eduardo@empresa.com.br",
    "whatsapp": "+5511999998888",
    "captured_by": "sofia",
    "captured_at": "2026-05-26T22:55:00Z"
  },
  "promotion": {
    "ready": false,
    "blocked_by": ["deepening_incomplete: faq,historico,regras-tacitas"],
    "promoted_at": null,
    "promoted_by": null
  }
}
```

### Invariantes que você NÃO pode quebrar

1. **`phase` é DERIVADO, não setado.** Mutar diretamente quebra a state
   machine. Quem precisa transicionar usa as ops do skill (`set_owner`,
   `mark_discovery_done`, `mark_area_complete`, etc.).
2. **`promotion.ready=true` exige TODOS os 3:** discovery.completed_at,
   owner_captured.email, todas as 5 áreas em areas_covered.
3. **owner_captured.email é PII** — não loga nem expõe sem autenticação
   platform_admin.
4. **`forced_completion_reason` é audit-only** — quando admin usa o
   escape hatch, o motivo fica gravado pra postmortem.

## Schema completo: state machine + transition rules

Ver `workspace/skills/onboarding-state/references/state-schema.md`. Não
duplico aqui — esse arquivo é a referência canônica e fica colado ao
script Python que implementa a lógica.

## Failure modes & recovery

### "Sofia não rodou nesse tenant publico"

Sintoma: `GET /tenants/{id}/onboarding-state` retorna 404. UI mostra
"Sem state.json — força o force=true path".

Causa: tenant publico foi criado mas ninguém conversou com Sofia, OU
Sofia teve erro antes da Phase 1, OU o volume foi recreado e perdeu o
state file.

Recovery: admin clica "Promover (com override)", marca `force=true`,
preenche `owner_email` manualmente. Auditado.

### "Promote falhou no step 8 (recreate)"

Sintoma: response 202 com `warning` mencionando recreate failure.

Causa: docker daemon flaky, imagem launcher faltando, env malformado.

Recovery: admin abre TenantDetail e clica botão **Recreate** manual.
Container reboota com env novo (DB já mostra is_public=false).

### "Container voltou mas chat não responde"

Sintoma: cliente faz login OK mas chat dá erro.

Causa mais provável: `${LITELLM_KEY}` não foi substituído no config.json,
ou o `model_list` é inválido (`api_keys` plural ausente).

Recovery: SSH no VPS, `cat /srv/saas/tenants/<id>/config.json` —
confirmar que api_keys está preenchido (não `${LITELLM_KEY}` literal).
Se literal, provisioner.SubstituteConfigPlaceholders quebrou — regerar
LiteLLM key + reescrever config + recreate.

### "Email não chegou"

Sintoma: cliente nunca recebeu credenciais.

Causa: SMTP não configurado, ou email landed em spam.

Recovery: admin pega `initial_password` do dialog (admin SEMPRE vê isso
mesmo se email falhar) → entrega manualmente pelo WhatsApp ou usando
`POST /tenants/{id}/magic-link` pra gerar um link de acesso temporário.

## Decisões de design (e por que)

### 1. Por que Sofia coleta credenciais (não tela separada)

Considerado: tela de cadastro tradicional após o chat.
Escolhido: Sofia pergunta no fim do discovery.

Razão: o tenant publico é literalmente uma conversa com Sofia. Pedir
"agora preencha esse form" quebra a fluência. Sofia já estabeleceu
contexto + confiança; pedir email+WhatsApp como continuação natural da
conversa converte mais.

### 2. Por que promoção é manual (não automática)

Considerado: trigger `promotion.ready=true` → promove sozinho.
Escolhido: admin clica botão.

Razão: V1 — admin precisa REVISAR antes de comprometer (cria user,
manda email, recreate container). Auto-promote é otimização V2 quando
o fluxo for confiável. O custo de uma promoção indevida (email mandado
pra endereço errado, container morto sem motivo) é alto.

### 3. Por que Catarina é obrigatória (com escape hatch)

Considerado: Sofia sozinha já libera promoção.
Escolhido: 5 áreas de aprofundamento exigidas por padrão, escape hatch
disponível.

Razão: respeita a visão de produto ("aprofundamento técnico antes de
promover") sem travar casos simples (cliente que dispensa deepening).
O escape hatch é registrado com motivo em audit, então não cria
shortcut silencioso.

### 4. Por que `phase` é derivado de outros campos

Considerado: campo `phase` set diretamente pelas skills.
Escolhido: `phase` recalculado em toda mutação.

Razão: evita estados impossíveis. Se você setasse `phase=ready_for_promotion`
mas `owner_captured.email=null`, o sistema ficaria em estado inválido.
Derivar de dados garante invariantes. Bug-free by construction.

### 5. Por que JSON file (não tabela no DB)

Considerado: tabela `onboarding_progress` no Postgres.
Escolhido: JSON no volume do tenant.

Razão:
- **Portabilidade**: backup do volume = backup do state. Rollback de
  tenant restaura tudo.
- **Coupling**: state da jornada é responsabilidade do workspace
  (Sofia/Catarina escrevem). DB é responsabilidade da plataforma
  (`is_public`, `owner_email`).
- **Recovery**: legível direto via SSH pra diagnóstico, sem precisar de
  acesso ao DB.
- **Migration**: cada tenant carrega seu próprio state — quando você
  muda o schema, novos tenants nascem com novo formato e antigos
  continuam funcionando.

Custo: não dá pra fazer query SQL tipo "todos tenants com
`phase=ready_for_promotion`". Pra isso, V2 pode ter uma view materialized
que cola DB + state.json via cron poll.

## Variáveis de ambiente injetadas em tenants publicos vs cliente

A diferença prática entre os dois estados:

| Variável | Publico (`is_public=true`) | Cliente (`is_public=false`) |
|---|---|---|
| `PICOCLAW_AUTH_MODE` | `trusted_gateway` | `launcher` (native local) |
| `PICOCLAW_ALLOWED_CHANNELS` | `whatsapp_native,pico` | `whatsapp_native,pico` (padrão) |
| `PICOCLAW_TENANT_ID` | sempre | sempre |
| `PICOCLAW_TRUSTED_GATEWAY_SECRET` | sempre | sempre (used pra outras chamadas internas) |
| `PICOCLAW_CONFIG_STRICT` | `true` | `true` |

E no DB:
- `tenants.is_public`: `true` → `false`
- `tenants.owner_email`: `ops@<base>` (sentinel) → email real
- `tenants.auth_backend`: `local` → `launcher`

## Fatia 5 — bridge automático Sofia → Catarina (implementada)

**Estado atual:** a Opção A foi implementada como cron job determinístico
no workspace. O job `onboarding-bridge-sofia-catarina` em
`workspace/cron/jobs.json` roda a cada 15 minutos e executa:

```sh
sh /root/.picoclaw/workspace/skills/bridge-flow/scripts/run.sh
```

O script:
- lê `workspace/state/onboarding.json` via skill `onboarding-state`;
- só dispara se `phase` for `discovery_done` ou `deepening_in_progress`;
- não duplica envio quando `deepening.first_contact_at` já existe;
- falha com estado auditável se o telefone do lead estiver ausente;
- grava `mark_bridge_attempt` antes do envio;
- envia a abertura da Catarina com `enviar-whatsapp-jotaduo`;
- só grava `mark_first_contact` depois que `send.py` retorna sucesso.

Isso remove a latência humana entre `discovery_done` e o início do
deepening quando o WhatsApp institucional está configurado. Rafael/admin
continuam como escape hatch manual quando o sidecar, segredo HMAC ou
telefone do lead não estão disponíveis.

### Opção B — Webhook no controlplane

Quando a skill `onboarding-state` chama `mark_discovery_done`, o
launcher (que executa o skill) detecta a mutação e faz um POST pro
controlplane:

```
POST /api/v1/tenants/{id}/notify-onboarding-event
  body: {"event": "discovery_done", "owner_captured": {...}}
```

Controlplane enfileira em uma queue de "post-discovery actions" e um
worker dispara Catarina via skill exec dentro do container.

**Prós:** event-driven (zero latência de polling). Centralized.
**Contras:** novo endpoint + worker + queue table. Mais código.

### Opção C — Hook no provisioner

Quando Provisioner detecta `state.json` mudou pra `discovery_done`, ele
mesmo dispara Catarina via `docker exec tenant-<id> picoclaw-launcher
trigger-agent catarina`.

**Prós:** menor surface area de mudança.
**Contras:** Provisioner não é watcher; precisaria de fsnotify ou
periodic check. Mistura responsabilidades (provisioner deveria ser
provisionar, não orchestrar agentes).

### Recomendação futura

Manter o cron workspace como implementação padrão. Quando a latência de
até 15 minutos virar problema, migrar para a Opção B com evento no
controlplane e fila de ações pós-discovery.

## Como o conteúdo de `workspace/` chega aos novos tenants

Pipeline com 3 caminhos. Sem entender isso, mudanças em Sofia/Catarina/skills viram regressões silenciosas:

```
workspace/  (repo, source-of-truth)
    │
    │  scripts/sync-baseline-workspace.py (via make sync-baseline
    │    OR go generate ./internal/saas/api/...)
    ▼
internal/saas/api/baseline-workspace/  (auto-gerado, não editar à mão)
    │
    │  //go:embed all:baseline-workspace
    │  embedded em controlplane binary
    ▼
GHA push → GHCR → VPS timer pull → controlplane recreate
    │
    │  EnsureDefaultWorkspace() na startup
    │  extractEmbeddedBaseline() → escreve em
    │  /srv/picoclaw-workspaces/default-business/home/
    ▼
DB workspaces row (slug=default-business, is_default_auto=true)
    │
    │  Provisioner.Create(workspace_id=default-business)
    │  CopyWorkspaceHome(host_path → tenant volume)
    ▼
Novo tenant em /srv/saas/tenants/<id>/ com TUDO de workspace/ presente
```

### Os 3 caminhos pra conteúdo chegar em novo tenant

| Caminho | Como | Quando |
|---|---|---|
| **A. Workspace existente no DB** | Admin escolhe `workspace_id` no wizard, Provisioner copia `/srv/picoclaw-workspaces/<slug>/home/` direto | Workspace já criado (manual ou auto-bootstrap) com conteúdo no host_path |
| **B. Baseline embed (auto-bootstrap)** | Primeira start sem `is_default_auto=true` → `EnsureDefaultWorkspace` extrai baseline embed | Deploys novos ou após reset do DB |
| **C. Upload manual** | `pwsh scripts/build-workspace-zip.ps1 -Upload` ou UI Workspaces → "Upload .zip" | Workspace customizado fora do baseline (variant por segmento) |

### O sync (`scripts/sync-baseline-workspace.py`)

1. Wipe `baseline-workspace/` preservando só `README.md`, `SYNCED_FROM`, `*.gitkeep`
2. Copy `workspace/` filtrando: drop runtime (sessions/, *.log), drop secrets (auth.json), drop scratch (mamiferos_*, etc.)
3. Empty `memory/` contents (filenames preserved como stubs — sem dados de cliente no binário)
4. Normalize `config.json`: `api_keys=["${LITELLM_KEY}"]`, paths Linux
5. Escreve `SYNCED_FROM` com commit hash + timestamp

### Quando rodar

- **Manual** após editar `workspace/`: `make sync-baseline && git add internal/saas/api/baseline-workspace/`
- **Automático** via `make generate`/`make build` (go generate dispara o sync)
- **CI guard**: `make check-baseline-sync` (parte de `make check`) falha se você esqueceu de regenerar

### Imutabilidade vs propagação

Trade-off central:

- Workspaces EXISTENTES (no host_path) são imutáveis pra novos tenants — assim como tenants são imutáveis pra workspace updates. Garante que clientes em produção não recebam mudanças surpresa.
- Baseline embed é o canal de PROPAGAÇÃO automática pra deploys novos — quem instala fresh hoje pega estado canônico de hoje.
- Sync via `go generate` mantém baseline ↔ repo sempre consistentes — CI falha se desincronizar.

Resultado: dev edita workspace/ → PR → mergeia → GHA builda controlplane → deploys novos pegam tudo. Mudança chega em tenants pré-existentes? Não automaticamente — operador decide caso a caso se vale re-upload + recreate.

## Quando alterar este fluxo

Esse fluxo é o **core product mechanic**. Alterações precisam
considerar:

- Mudar o schema do `onboarding.json`? Toca: skill state.py, doc, handler
  promote (parser), UI typescript types. **Versionar:** se mudar o
  formato incompatível, adicionar `version: 2` no JSON e migration.

- Adicionar fases novas? (Discovery_in_review, deepening_paused, etc.)
  Decidir antes: phase é derivado ou setado? Se derivado, adicionar
  campo de dados que cause a derivação.

- Mudar quem captura `owner_email`? (UI dedicada, outra skill, etc.)
  Lembrar que backend `/promote` valida o formato de novo. Tudo bem
  mudar a captura sem tocar no validator.

- Adicionar agente novo entre Sofia e Catarina? (Ex: "Maria" pra
  validação de PII antes do deepening) Adicionar nova phase derivada e
  novo método na state machine; UI badge map precisa do label novo.

## Referências cruzadas

- [state-schema.md](../../workspace/skills/onboarding-state/references/state-schema.md) — schema canônico do onboarding.json
- [public-onboarding-tenant.md](./public-onboarding-tenant.md) — design histórico (deprecated; superseded por este doc)
- [saas-tenancy.md](./saas-tenancy.md) — multi-tenant topology no VPS
- [workspaces.md](./workspaces.md) — como workspaces seedam tenants
- [admin-in-launcher.md](./admin-in-launcher.md) — UI admin embutida no launcher
- PRs históricas: #104 (wizard tenant-type), #108 (owner_email opcional pra publico), #109 (ui-visibility endpoint), #110 (pico no allowlist), #113 (state machine), #114 (POST promote), #115 (PromoteTenantCard)
