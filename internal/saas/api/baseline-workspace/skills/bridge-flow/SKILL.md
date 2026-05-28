---
name: bridge-flow
description: >
  Script determinístico (não-LLM) que executa o fluxo Sofia→Catarina
  do cron `onboarding-bridge-sofia-catarina`. Substitui o `agent_turn`
  que disparava Catarina via LLM, contornando o gap onde claude-cli
  Sonnet via subscription não emite JSON tool_call no formato esperado
  pelo gateway (audit 2026-05-28: 6+ ciclos de teste mostraram
  tool_calls=0 em TODAS as iterações).
visibility: internal
---

# bridge-flow

Wrapper shell que executa a sequência ORIGINAL do BRIDGE_CHECK
recipe (chamar onboarding-state, decidir SILENT_NOOP ou prosseguir,
marcar first_contact, mandar WhatsApp) **sem depender do LLM**
emitir tool_calls.

## Quando usar

Apenas no cron `onboarding-bridge-sofia-catarina`. Substitui o
`payload.kind: agent_turn` original.

## Como funciona

```bash
sh /root/.picoclaw/workspace/skills/bridge-flow/scripts/run.sh
```

Executa em ~2-3 segundos (vs ~3-8 min do LLM call que respondia texto
sem chamar tool). Sem timeout do exec tool (default 60s) é folgado.

Saídas (stdout):
- `SILENT_NOOP phase=X` — discovery ainda em andamento OU já promovido
- `SILENT_NOOP first_contact_at=X` — já fez antes
- `BRIDGE_ERROR: <motivo>` — owner sem phone, send falhou, etc.
- `BRIDGE_DISPATCHED area=equipe phone=X` — sucesso, WA enviado

## Por que não LLM

Tentamos 2 prompts (REGRA ABSOLUTA + JSON exemplos few-shot) e Catarina
via claude-cli continuou respondendo texto descritivo sem emitir o JSON
`{"tool_calls":[...]}` que o gateway extrai. Bloqueio fundamental do
provider, não do prompt. Ver
[[project-catarina-tool-call-blocker]] na memória.

Esse script bypassa o LLM completamente pro caminho mecânico do
bridge — a Catarina LLM segue sendo invocada nas sessões reais de
deepening depois (quando o dono responde no WhatsApp).

## Coordenação

- Cron `onboarding-bridge-sofia-catarina` deve estar com
  `payload.kind: command, command: "sh .../run.sh"`
- Skills usadas pelo script (todas via stdin/CLI direto, sem agent):
  - `onboarding-state/scripts/state.py` (get + mark_first_contact)
  - `enviar-whatsapp-jotaduo/scripts/send.py` (outbound WA)
