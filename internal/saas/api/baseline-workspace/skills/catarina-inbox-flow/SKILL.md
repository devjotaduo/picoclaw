---
name: catarina-inbox-flow
description: >
  Script deterministico (nao-LLM) para o cron
  `onboarding-catarina-inbox-poller`: le respostas novas do dono no inbox
  da Jotaduo, marca progresso no onboarding-state e envia a proxima
  pergunta curta de aprofundamento via WhatsApp institucional.
visibility: internal
---

# catarina-inbox-flow

Executa o trecho mecanico do aprofundamento assincromo da Catarina sem
depender do LLM emitir tool calls.

## Como usar

```bash
python3 /root/.picoclaw/workspace/skills/catarina-inbox-flow/scripts/run.py
```

## Saidas

- `SILENT_NOOP phase=X` — tenant ainda nao esta em aprofundamento.
- `SILENT_NOOP no_owner_response` — nao chegou resposta nova.
- `INBOX_CLARIFY area=X reason=Y phone=Z messages=N` — resposta chegou,
  mas ainda esta fraca/curta; Catarina pediu mais detalhe e a area nao foi
  marcada como concluida.
- `INBOX_DISPATCHED completed=X next=Y phone=Z messages=N` — resposta
  processada, area avancada e proxima pergunta enviada por WhatsApp.
- `INBOX_DONE completed=X messages=N` — ultima area foi marcada e nao ha
  nova pergunta a enviar.
- `INBOX_ERROR: <motivo>` — pre-condicao faltando ou falha no envio.

## Contrato

O script usa somente skills locais:

- `onboarding-state/scripts/state.py`
- `verificar-respostas-jotaduo/scripts/check-inbox.py`
- `enviar-whatsapp-jotaduo/scripts/send.py`

Ele faz peek no inbox antes de consumir. Se o envio WhatsApp falhar, o
ponteiro nao avanca e o cron pode tentar de novo.

Respostas fracas como "ok", "sim" ou texto muito curto geram
`INBOX_CLARIFY` e nao completam a area. Respostas suficientes sao salvas em:

- `state/catarina-deepening.jsonl` — trilha append-only de respostas,
  incluindo tentativas fracas.
- `memory/aprofundamento-catarina.md` — resumo consolidado das respostas
  suficientes, usado como memoria operacional do aprofundamento.
