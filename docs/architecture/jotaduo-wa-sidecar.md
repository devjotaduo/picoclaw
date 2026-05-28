# jotaduo-wa-sidecar — WhatsApp Jotaduo emprestado a tenants públicos

> **TL;DR.** Um serviço separado (`jotaduo-wa`) é dono do pareamento do
> WhatsApp institucional da Jotaduo. Tenants **públicos** (e SÓ eles) recebem
> credenciais HMAC pra mandar mensagens via API HTTP do sidecar. Respostas
> do lead voltam pra esse mesmo tenant via webhook que o sidecar dispara.
> Quando admin promove o tenant pra cliente, o `/promote` revoga a routing
> no sidecar e o `Provisioner.Recreate` tira a credencial do container —
> defesa em camadas garantindo que cliente promovido perde acesso ao número
> institucional.

Esse doc é o complemento técnico de [public-tenant-promotion.md](public-tenant-promotion.md)
focando especificamente em **como** a Catarina alcança leads via WhatsApp
e como esse acesso é revogado na promoção. Para o fluxo geral
(Sofia discovery → Catarina aprofundamento → admin promove), leia o doc da
promoção primeiro.

## Por que um sidecar (e não bind-mount do `store.db`)

A primeira ideia óbvia — "bind-monta `$JOTADUO_HOME/whatsapp/store.db`
read-write em todo container público" — **não funciona**:

1. `whatsmeow` (o cliente WA) usa SQLite com WAL. Concorrência entre N
   processos no mesmo arquivo gera lock conflict e corrupção de chaves.
2. Pior: WhatsApp identifica o pareamento por `device.ID` único. Dois
   processos conectados com a mesma identidade fazem o servidor desconectar
   um dos dois em loop. **O número real do Jotaduo é desautenticado.**

Conclusão: **uma única conexão whatsmeow** é o limite duro. Daí o sidecar:
**um** processo dono do pareamento, **muitos** consumidores via HTTP.

## Topologia em runtime

```
                                   tenant publico A
                                  ┌─────────────────┐
                                  │ Catarina        │
                                  │  + skill        │
                                  │  enviar-whatsapp│
                                  │  -jotaduo       │
                                  └────────┬────────┘
                                           │ POST /internal/wa/send
                                           │ HMAC-signed body
                                           ▼
   WhatsApp servers          ┌─────────────────────────┐
        ▲   │                │  jotaduo-wa (sidecar)   │
        │   │  WA protocol   │  - whatsmeow client     │
        └───┼───────────────►│  - HTTP :18810          │
            │                │  - SQLite routing.db    │
            │                │  - store.db (paired WA) │
   inbound  │                └──────────┬──────────────┘
            │                           │ POST /api/launcher/
            │                           │ jotaduo-wa-inbound
            │                           ▼
            │                   ┌─────────────────┐
            │                   │ tenant publico A│
            │                   │  /api/launcher/ │
            │                   │  jotaduo-wa-    │
            │                   │  inbound        │
            │                   │  → appends to   │
            │                   │  workspace/     │
            │                   │  state/jotaduo- │
            │                   │  wa-inbox.jsonl │
            │                   └────────┬────────┘
            │                            │ (skill
            │                            │  verificar-
            │                            │  respostas)
            │                            ▼
            └───── lead replies ──── Catarina lê inbox JSONL
```

Dois flows independentes:

- **Outbound** (Catarina → lead): skill assina body HMAC, POSTa em
  `http://jotaduo-wa:18810/internal/wa/send`. Sidecar manda via whatsmeow,
  auto-registra `phone → tenant_id` na routing.db pra inbound voltar.
- **Inbound** (lead → tenant): whatsmeow recebe mensagem, sidecar olha
  routing `sender_phone → tenant_id`, HMAC-signs e POSTa em
  `http://tenant-<id>:18800/api/launcher/jotaduo-wa-inbound`. Launcher
  verifica HMAC + timestamp + tenant_id, appende em
  `workspace/state/jotaduo-wa-inbox.jsonl`. Catarina lê depois via skill.

## Componentes implementados (5 fatias + 2 follow-ups)

| Fatia | PR | Onde |
|---|---|---|
| 1 — sidecar binary | [#118](https://github.com/devjotaduo/picoclaw/pull/118) | `cmd/jotaduo-wa-sidecar/`, `internal/jotaduowa/`, `docker/saas/Dockerfile.jotaduo-wa` |
| 2 — skill envio | [#119](https://github.com/devjotaduo/picoclaw/pull/119) | `workspace/skills/enviar-whatsapp-jotaduo/` |
| 3 — provisioner injects envs | [#120](https://github.com/devjotaduo/picoclaw/pull/120) | `internal/saas/tenant/provisioner.go::buildSpec` (dentro do `if t.IsPublic`) |
| 4 — inbound dispatch | [#121](https://github.com/devjotaduo/picoclaw/pull/121) | `internal/jotaduowa/dispatcher.go`, `web/backend/api/jotaduo_wa_inbound.go` |
| 5 — promote revokes routing | [#122](https://github.com/devjotaduo/picoclaw/pull/122) | `internal/saas/api/jotaduo_wa_client.go`, hook em `tenants_promote.go` |
| follow-up — skill leitura inbox | [#123](https://github.com/devjotaduo/picoclaw/pull/123) | `workspace/skills/verificar-respostas-jotaduo/` |
| follow-up — deploy CI/CD wiring | [#124](https://github.com/devjotaduo/picoclaw/pull/124) | `release-controlplane.yml`, `picoclaw-deploy.sh`, `docker-compose.prod.yml` |

## Defesa em camadas: promoção retira acesso

Quando admin promove tenant publico → cliente
([`/tenants/{id}/promote`](../../internal/saas/api/tenants_promote.go)),
**duas camadas independentes** garantem que o cliente perde acesso ao WA
institucional:

1. **Container env strip** (Fatia 3 — provisioner): `Recreate` reconstrói
   o container do tenant. Como `is_public=false` agora, `buildSpec` não
   injeta mais `JOTADUO_WA_HMAC_SECRET` nem `JOTADUO_WA_URL`. A skill
   `enviar-whatsapp-jotaduo` falha com mensagem clara
   ("JOTADUO_WA_URL is required... only injected in public tenants").
2. **Routing revoke** (Fatia 5 — promote handler): antes do recreate, o
   handler chama `DELETE /internal/wa/routing/by-tenant/{id}` no sidecar.
   Toda rota `phone → tenant_id` daquele tenant é apagada. Se o lead
   responder DEPOIS da promoção, o sidecar logaria "no routing for
   inbound" e dropa — não tenta nem dispatch pro launcher antigo.

Pra ter um leak, teria que falhar **as duas camadas** + Catarina ter
outreach pendente. Triple failure necessário.

## Secrets e env vars

Operador precisa setar **dois** secrets em `/srv/saas/picoclaw/.env`:

```bash
JOTADUO_WA_HMAC_SECRET=<openssl rand -hex 32>   # 64 hex chars
JOTADUO_WA_ADMIN_TOKEN=<openssl rand -hex 24>   # 48 hex chars — pra UI de pareamento
```

Compose distribui via:

| Onde | Como |
|---|---|
| Sidecar container | direto, `JOTADUO_WA_HMAC_SECRET` + `JOTADUO_WA_ADMIN_TOKEN` |
| Controlplane container | `${JOTADUO_WA_HMAC_SECRET}` → `PICOCLAW_JOTADUO_WA_HMAC_SECRET` (convenção Picoclaw) |
| Tenant publico container | provisioner pega de `Cfg.JotaduoWAHMACSecret`, injeta como `JOTADUO_WA_HMAC_SECRET` |
| Tenant cliente container | **nunca recebe** — defesa em camadas |

URL do sidecar é fixa por convenção compose (`http://jotaduo-wa:18810`),
configurável via `PICOCLAW_JOTADUO_WA_URL` se rodar fora do mesmo network.

## Pareamento operacional

**Primeira vez (ou se o número for desautenticado):**

1. Operador abre `https://adm.<base>/jotaduo-wa/pair?token=<ADMIN_TOKEN>`
   no celular institucional do Jotaduo.
2. UI faz polling em `/pair/qr` (JSON) e renderiza QR data-URI.
3. Operador abre WhatsApp do número institucional → Configurações →
   Aparelhos conectados → Conectar um aparelho → escaneia.
4. `status` vira `confirmed`, página mostra "pareado: 55119...".
5. Pareamento persiste em `/srv/picoclaw/jotaduo-wa/whatsapp/store.db`
   (bind-mountado no container). Sobrevive a restart.

**Restart do sidecar (sem perder pareamento):**

```bash
docker compose -p picoclaw-saas \
  -f /srv/saas/picoclaw/docker/saas/docker-compose.prod.yml \
  --env-file /srv/saas/picoclaw/.env \
  restart jotaduo-wa
```

**Re-pareamento (último recurso, desautentica e força QR novo):**

```bash
# Para o serviço
docker stop jotaduo-wa
# Apaga o store.db (preserva routing.db — recovery rápido das rotas)
rm /srv/picoclaw/jotaduo-wa/whatsapp/store.db
# Sobe — vai gerar QR novo
docker start jotaduo-wa
# Abre /pair e escaneia novamente
```

## On-disk layout

```
/srv/picoclaw/jotaduo-wa/        ← bind-mount no container
├── whatsapp/
│   ├── store.db                 ← pareamento whatsmeow (NÃO commitar, NÃO rsyncar)
│   └── conversations.db         ← cache do inbox interno do whatsmeow
└── routing.db                   ← SQLite com tabela wa_routing(phone PK, tenant_id, registered_at)
```

**Backup**: `whatsapp/store.db` é insubstituível — perder = re-pareamento
com o celular do Jotaduo. Incluir no backup R2 diário (TODO operacional;
hoje não está coberto pelo backup script).

`routing.db` é recuperável — se perdida, o primeiro outbound de cada
tenant publico reregistra naturalmente.

## Storage do inbox no tenant publico

Quando lead responde, o launcher do tenant appende JSONL em
`workspace/state/jotaduo-wa-inbox.jsonl` (verbatim do body que o sidecar
assinou). Cada linha é o payload completo:

```json
{"tenant_id":"abc-123","from_phone":"5511999998888","from_name":"Pedro Clínica","chat_jid":"5511999998888@s.whatsapp.net","message_id":"wamid.HBg...","content":"Catarina, agora sim, pode mandar","timestamp":1715000000,"sent_at":1715000010}
```

Catarina lê via skill `verificar-respostas-jotaduo`
(`scripts/check-inbox.py`) que mantém ponteiro de byte-offset em
`workspace/state/jotaduo-wa-inbox.pointer`. `--consume` avança o ponteiro
atomicamente (tmp + rename).

## Falhas conhecidas e como debugar

**Sintoma:** `/internal/wa/send` retorna `{"status":"sent"}` mas o lead
nao recebe, e os logs do sidecar mostram `Failed to issue privacy token`
ou `Server returned different participant list hash`
**Causa:** historicamente o canal `whatsapp_native` mandava direto para o
PN JID (`...@s.whatsapp.net`) sem preflight de destinatario. Em sessoes
com LID presente mas `lid_migration_ts=0`, o WhatsApp podia aceitar o node
HTTP e depois logar erro de privacy token. Tambem havia falso positivo ao
enviar para o proprio numero pareado com variante brasileira do nono digito.
**Fix:** builds a partir de `16aebf6` validam o destinatario com
`IsOnWhatsApp`, canonizam JIDs, tentam resolver PN -> LID e rejeitam
self-send. Runbook completo em
[`docs/operations/jotaduo-wa-real-delivery.md`](../operations/jotaduo-wa-real-delivery.md).

**Sintoma:** Catarina diz `503 whatsapp not paired`
**Causa:** sidecar tá vivo (`/healthz=200`) mas QR nunca foi escaneado, OU
WhatsApp desautenticou o pareamento
**Fix:** operador abre `/pair`, escaneia. `/readyz` confirma quando OK.

**Sintoma:** Catarina diz `JOTADUO_WA_URL required`
**Causa:** tenant não é público (ou foi promovido). Skill detectou ausência
do env e falhou fast (comportamento correto pra cliente).
**Fix:** se realmente deveria ser público, checar `tenants.is_public=true`
no DB + `docker exec tenant-X env | grep JOTADUO_WA`.

**Sintoma:** `bad signature` em `/internal/wa/send`
**Causa:** `JOTADUO_WA_HMAC_SECRET` divergente entre sidecar e tenant.
**Fix:** confirme que `/srv/saas/picoclaw/.env` tem só uma definição
de `JOTADUO_WA_HMAC_SECRET` e que sidecar+controlplane foram recreated
depois dela ser adicionada.

**Sintoma:** `/jotaduo-wa/pair` retorna a SPA do controlplane em vez do
sidecar
**Causa:** Traefik priority — o router `controlplane` (rule longa com
HostRegexp) ganha por padrão. **Fix permanente em [#126](https://github.com/devjotaduo/picoclaw/pull/126)**:
`traefik.http.routers.jotaduo-wa-pair.priority=200` no label do compose.

**Sintoma:** lead respondeu mas não aparece na inbox JSONL
**Causa:** routing.db perdeu a entrada (ex: revoke prematuro), ou launcher
endpoint rejeitou HMAC (env divergente), ou tenant não tava registrado em
nenhuma rota (Catarina nunca mandou mensagem pra esse número antes).
**Fix:** `docker exec jotaduo-wa sqlite3 /var/lib/jotaduo-wa/routing.db
'SELECT * FROM wa_routing'` mostra rotas atuais. Logs do sidecar mostram
"no routing for inbound" se phone não tava mapeado.

## Limitações conhecidas

- **Best-effort delivery**: dispatcher do sidecar não tem retry queue. Se
  o launcher do tenant tá down quando lead responde, mensagem é dropada
  (log fica). Próxima resposta do mesmo lead retenta naturalmente.
- **One-active-device** do whatsmeow significa que o número institucional
  **não pode** ser usado no celular do dono pro dia-a-dia simultaneamente.
  Pareamento como "aparelho conectado" coexiste, mas se o dono logar com
  WhatsApp Web/Desktop ou trocar de celular, o sidecar perde a conexão.
- **Backup do store.db não automatizado** (TODO ops). Perda = re-pareamento
  manual via QR.
- **Deploy de sidecar deve ser via GHA + timer** — o VPS atual puxa
  `ghcr.io/devjotaduo/picoclaw-jotaduo-wa:main`, retaga para
  `picoclaw/jotaduo-wa:latest` e recria `jotaduo-wa` via
  `picoclaw-deploy.service` quando o image ID muda. Nao copie binario,
  source code ou imagem manual para o VPS; acione
  `.github/workflows/release-controlplane.yml` e force o timer se precisar
  validar imediatamente.
