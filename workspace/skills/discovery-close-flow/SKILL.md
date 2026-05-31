---
name: discovery-close-flow
description: >
  Poller determinístico (cron) que cristaliza o fim do discovery da Sofia:
  lê state/discovery-close.request.json e roda onboarding-state discovery_close
  (set_owner + mark_discovery_done) sem depender do LLM emitir tool_call.
  Simétrico ao catarina-inbox-flow (lado deepening). NÃO conversa com cliente.
visibility: internal
---

# discovery-close-flow

State machine helper que garante a cristalização do fim do discovery mesmo
quando o modelo não consegue emitir tool calls de forma confiável (regime
claude-cli — ver [[project_catarina_tool_call_blocker]]).

## Por que existe

O discovery da Sofia roda perfeito em texto puro, mas o passo final precisa
PERSISTIR estado estruturado (`set_owner` + `mark_discovery_done`). Pedir
isso ao LLM via tool call é o ponto frágil: no claude-cli o tool call cai e a
promoção nunca destrava. Este poller move a EXECUÇÃO pra um script
determinístico, espelhando o que o `catarina-inbox-flow` já faz no lado do
aprofundamento.

## Contrato

**Sofia** (em tenant publico ela roda como agente `main`, workspace raiz)
deposita UM arquivo no fim do discovery:

```
state/discovery-close.request.json
```

Conteúdo = um payload válido de `onboarding-state` com `action=discovery_close`:

```json
{
  "action": "discovery_close",
  "name": "<nome do dono>",
  "email": "<email>",
  "whatsapp": "<whatsapp>",
  "segment": "<segmento detectado>",
  "summary": "<resumo executivo 2-3 linhas>",
  "captured_by": "sofia"
}
```

Gravar UM arquivo é a ação mais confiável que o modelo consegue fazer; todo
o resto é determinístico.

## O que o poller faz (cron `onboarding-discovery-close`, a cada poucos min)

1. Sem `discovery-close.request.json` → `SILENT_NOOP no_request`.
2. Request inválido / sem email → arquiva como `.error` e loga `CLOSE_ERROR`
   (não fica em loop).
3. Estado já fechado (o caminho inline da Messages API ganhou a corrida) →
   arquiva como `.done` e loga `DISCOVERY_ALREADY_DONE`.
4. Caso normal → roda `state.py --payload-file <request>` (action
   `discovery_close` = set_owner + mark_discovery_done atômico), arquiva o
   request como `.done`, loga `DISCOVERY_CLOSED email=...`.

Idempotente: o request vira `.done` depois do primeiro sucesso, então o cron
não re-roda. Se o caminho inline já tinha fechado, o poller só arquiva.

## Dois regimes — mesma operação

- **claude-cli (subscription):** confia no cron. A Sofia só precisa do
  `write_file` do request. Latência de poucos minutos é irrelevante — o admin
  promove manualmente bem depois.
- **Messages API (tool call confiável):** a Sofia roda
  `state.py --payload-file state/discovery-close.request.json` inline pra
  cristalizar na hora; o cron vira no-op (arquiva o request).

Em ambos o `state/discovery-close.request.json` é a fonte única — sem
detecção de provider no prompt.

## Relacionados

- `onboarding-state` — a state machine que este poller aciona.
- `catarina-inbox-flow` — poller irmão do lado do aprofundamento.
- `jotaduo-discovery` — skill da Sofia que deposita o request.
