---
name: verificar-respostas-jotaduo
description: Lê respostas inbound do WhatsApp da Jotaduo (entregues pelo sidecar jotaduo-wa em workspace/state/jotaduo-wa-inbox.jsonl). Use quando precisar saber se algum lead respondeu a uma mensagem que você enviou via `enviar-whatsapp-jotaduo`. Mantém ponteiro de "lido" pra não repetir as mesmas mensagens em chamadas sucessivas.
version: 1.0.0
language: pt-br
---

# verificar-respostas-jotaduo

Lê as mensagens que leads enviaram em resposta às outreach que a Catarina
fez via `enviar-whatsapp-jotaduo`. O sidecar `jotaduo-wa` recebe a
mensagem, descobre qual tenant é o dono daquele número (via rota
registrada no send) e dispara webhook pro launcher do tenant. O launcher
salva tudo verbatim em `workspace/state/jotaduo-wa-inbox.jsonl`.

Esta skill é o leitor: lê o arquivo, devolve só mensagens novas (mantém
ponteiro de "lido"), e opcionalmente avança o ponteiro pra marcar como
processado.

## Quando usar

- Início de sessão de curadoria: "houve resposta nova do dono desde
  ontem?"
- Depois de enviar uma mensagem com `enviar-whatsapp-jotaduo`, antes de
  prosseguir, pra ver se já teve réplica
- Quando o `aprofundar-empresa` indica que algum lead estava em
  pendência aguardando confirmação

## Quando NÃO usar

- Em tenant **cliente** — o sidecar nem é injetado no env, então o
  arquivo jamais existe. Skill volta vazia, sem ruído.
- Pra ler conversa em tempo real — esta é arquitetura async file-drop,
  latência típica de segundos mas não realtime. Pra realtime usaria
  outro canal.

## Arguments

```
scripts/check-inbox.py [--consume] [--limit N] [--since-id MSGID]
```

- `--consume` — após emitir as mensagens, avança o ponteiro de "lido"
  pra que a próxima chamada NÃO retorne as mesmas. Use isso só quando
  você realmente processou (gravou na memória, respondeu, etc.). O
  default é peek (lê sem marcar).
- `--limit N` — emite no máximo N mensagens (defaults: sem limite).
  Útil pra triagem rápida.
- `--since-id MSGID` — emite só mensagens APÓS a com `message_id=MSGID`,
  ignorando o ponteiro. Útil pra continuar de onde parou em scripts
  externos.

## Output

JSONL no stdout — um objeto por linha, mesmo shape que o sidecar enviou:

```json
{"tenant_id":"abc-123","from_phone":"5511999998888","from_name":"Pedro Clínica","content":"Catarina, agora sim, pode mandar","chat_jid":"5511999998888@s.whatsapp.net","message_id":"wamid.HBg...","timestamp":1715000000,"sent_at":1715000010}
```

Stdout vazio = sem mensagens novas (exit 0, normal).

Use `jq` no pipe pra extrair só o que interessa:

```bash
scripts/check-inbox.py | jq -r '"\(.from_name): \(.content)"'
```

## Side effects

- Lê `$PICOCLAW_HOME/workspace/state/jotaduo-wa-inbox.jsonl` (read-only,
  exit 0 vazio se arquivo inexiste)
- Lê/escreve `$PICOCLAW_HOME/workspace/state/jotaduo-wa-inbox.pointer`
  (texto puro com o offset em bytes do último byte lido). Só escreve
  quando `--consume` foi passado.

## Exit codes

- `0` — sucesso (com ou sem novas mensagens)
- `1` — erro de I/O ou JSON malformado no inbox
- `2` — env `PICOCLAW_HOME` ausente (não deve acontecer em runtime)

## Exemplos

```bash
# Peek — vê o que tem novo sem marcar como lido
scripts/check-inbox.py

# Processa e marca como lido (uso normal da Catarina)
scripts/check-inbox.py --consume

# Triagem rápida — só as 3 últimas novas
scripts/check-inbox.py --limit 3

# Reprocessar do meio do arquivo
scripts/check-inbox.py --since-id wamid.HBgN
```

## Coordenação com `enviar-whatsapp-jotaduo`

Fluxo típico de uma sessão da Catarina:

1. `check-inbox.py --consume` — vê o que o dono respondeu desde a
   última sessão
2. Processa cada resposta (gravar na memória, decidir próxima pergunta)
3. `enviar-whatsapp-jotaduo` pra próxima pergunta da área
4. (fim da sessão — espera próxima resposta)
