---
name: enviar-whatsapp-jotaduo
description: Envia uma mensagem de WhatsApp pelo número institucional da Jotaduo via o sidecar jotaduo-wa. Use APENAS em tenant publico (Catarina precisa alcançar o lead que ainda não tem WA próprio configurado). Em tenant cliente esta skill falha — o cliente tem o WhatsApp dele.
version: 1.0.0
language: pt-br
---

# enviar-whatsapp-jotaduo

Mensagem outbound pelo WhatsApp institucional da Jotaduo. Quem realmente
manda é o serviço `jotaduo-wa` (sidecar do controlplane) — esta skill só
assina e despacha um POST.

## Quando usar

- Tenant é **publico** (em fase de onboarding/aprofundamento) E o lead
  ainda não cadastrou WhatsApp próprio.
- Catarina precisa fazer outreach pra coletar informação que falta
  (entrar em contato pra agendar sessão curta, mandar follow-up de
  pendência, confirmar dado antes de gravar memória).

## Quando NÃO usar

- Tenant **cliente** — após `tenants_promote.go` revogar a rota, qualquer
  chamada aqui retorna 503. O cliente promovido usa o **próprio**
  WhatsApp (canal `whatsapp_native` configurado no painel dele).
- Resposta inbound — pra responder mensagens que CHEGAM, use o canal
  normal de chat. Esta skill é só pra iniciar contato.
- Marketing em massa — o número institucional da Jotaduo é uma identidade
  única e pareada via QR. Enviar centenas de mensagens em pouco tempo é
  caminho rápido pra ban da Meta.

## Como funciona

```
agent → enviar-whatsapp-jotaduo → jotaduo-wa (HTTP HMAC) → whatsmeow → WhatsApp
```

O sidecar `jotaduo-wa` registra automaticamente um routing
`<phone> → $PICOCLAW_TENANT_ID` quando o envio dá certo, pra que respostas
do lead voltem pra este mesmo tenant via webhook em
`workspace/state/jotaduo-wa-inbox.jsonl`.

## Arguments

```
python3 scripts/send.py <phone> <message>
# OU (wrapper compativel):
scripts/send.sh <phone> <message>
```

`scripts/send.py` é o source of truth (stdlib python, sem deps). O wrapper
`scripts/send.sh` resolve `python3` / `python` no PATH e exec'a o `.py`
— mantido pra retrocompatibilidade com agentes que ainda chamam `.sh`.
Container tenant não tem bash nem openssl, então a versão antiga
falhava silenciosamente em prod (audit 2026-05-28).

- `<phone>` — número de destino. Aceita formatos:
  - `5511999998888` (recomendado: country code + DDD + número)
  - `+5511999998888`
  - `5511999998888@s.whatsapp.net` (JID completo)
- `<message>` — texto. Aspas se contém espaços. Quebras de linha
  permitidas com `\n` (interpretado pelo bash).

## Env vars

| Var | Origem | Obrigatória |
|---|---|---|
| `JOTADUO_WA_URL` | injetada pelo provisioner em tenants `is_public=true` (Fatia 3) | sim |
| `JOTADUO_WA_HMAC_SECRET` | injetada pelo provisioner em tenants `is_public=true` (Fatia 3) | sim |
| `PICOCLAW_TENANT_ID` | sempre injetada pelo provisioner | sim |

Se qualquer uma faltar, a skill falha com exit 1 e mensagem clara
direcionando pra checar se este tenant é mesmo público.

## Side effects

POST autenticado pra `${JOTADUO_WA_URL}/internal/wa/send` com body:

```json
{
  "tenant_id": "<PICOCLAW_TENANT_ID>",
  "to":        "<phone>",
  "text":      "<message>",
  "ts":        <unix_timestamp>
}
```

Assinado via HMAC-SHA256 usando `JOTADUO_WA_HMAC_SECRET`. O header
`X-Jotaduo-WA-Signature` carrega o hex digest. Timestamp ±5 min do agora
é exigido pelo sidecar (anti-replay).

## Exit codes

- `0` — enviado (HTTP 200 do sidecar, message IDs no stdout)
- `1` — args inválidos OU env var faltando
- `2` — erro de rede chamando o sidecar (curl não retornou)
- `3` — sidecar retornou non-2xx (corpo da resposta em stderr) — comum:
  - `401 bad signature` — HMAC secret divergente entre tenant e sidecar
  - `503 whatsapp not paired` — operador precisa parear em
    `adm.<base>/jotaduo-wa/pair`
  - `503 hmac secret not configured` — sidecar subiu sem
    `JOTADUO_WA_HMAC_SECRET`
  - `502 send failed: recipient ... is not registered on WhatsApp` —
    numero nao passou na verificacao `IsOnWhatsApp`
  - `502 send failed: recipient matches the paired WhatsApp account` —
    tentativa de enviar para o proprio numero institucional (inclui
    variante brasileira com nono digito)

## Semantica de entrega

Desde o fix de 2026-05-28, o sidecar deve retornar `message_ids` reais no
stdout quando o envio for aceito pelo WhatsApp:

```json
{"message_ids":["3EB..."],"status":"sent","tenant_id":"..."}
```

Isso comprova que o sidecar autenticou, validou o destinatario e recebeu
ack do envio. Nao comprova leitura no aparelho do lead. Para validar um
problema de entrega real, confira tambem os logs recentes do sidecar:

```bash
docker logs --since 2m jotaduo-wa 2>&1 | tail -160
```

Se aparecer `Failed to issue privacy token` ou
`Server returned different participant list hash` logo apos o envio, siga
o runbook em
`docs/operations/jotaduo-wa-real-delivery.md`.

## Exemplos

```bash
# Mensagem simples
scripts/send.sh 5511999998888 "Oi Pedro, sou a Catarina da Jotaduo. Quando você tem 5 min hoje pra falar sobre os horários da clínica?"

# Multilinha
scripts/send.sh 5511999998888 "Pedro, anotei que a clínica abre 9h-18h.
Falta confirmar: vocês atendem sábado de manhã?"
```

## Coordenação com Catarina

Catarina usa esta skill SOMENTE depois de:

1. Confirmar que `state/onboarding.json` está em fase `deepening` (não em
   `discovery` — Sofia ainda no comando).
2. Ler `memory/jotaduo/clientes/<slug>.md` (dossiê da Sofia) pra saber o
   nome do dono e o contexto.
3. Verificar que tem o telefone do dono (campo `contact_whatsapp` no
   intake — vem do que a Sofia coletou).

Se qualquer pré-requisito faltar: NÃO chama esta skill, marca pendência
no state e dispara `notify_user` pro admin completar.
