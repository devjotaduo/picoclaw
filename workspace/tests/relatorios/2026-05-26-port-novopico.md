---
data: 2026-05-26
tipo: port-de-skills
origem: C:/Users/ruthe/Desktop/novoPico/picoclaw/workspace/
metodologia: 10 Explore agents paralelos comparando skill-a-skill + apply best
---

# Port novoPico → current workspace + fixes da auditoria 2026-05-26

## Skills portadas (15 do total de 29 do novoPico)

| novoPico | destino current | modo | racional |
|---|---|---|---|
| `lead-qualifier/` | `lead-qualification/` | merge | Current era **STUB** sinalizado bloqueante pela auditoria QA 2026-05-22. novoPico tem `qualify.py` (99 linhas) com BANT determinístico + rejeição de keys sensíveis. Desbloqueia funil Marcos. |
| `anti-fraude/` (scripts) | `privacidade/anti-fraude/` | merge | Current tinha só SKILL.md (guideline). novoPico add 88 linhas Python: 28 fraud triggers, 5-tier risk, fail-safe defaults. Clara/Rafael ganham guard automático. |
| `kb-lookup/` (scripts) | `knowledge-base-resolution/` | merge | Current era stub. novoPico add `search_kb.py` (token search em memory/*.md, top-5 + excerpts). Reduz escalation cega da Camila quando FAQ tem conteúdo parcial. |
| `whatsapp-follow-up-planner/` | `whatsapp-follow-up-planner/` | merge | Current stub. novoPico tem regra completa: hot leads >24h, tickets >48h, propostas >72h, 3-attempt cap, business hours. Substitui notify_user manual do Marcos. |
| `consent-lgpd/` | `consent-lgpd/` | new | Current não tinha. Consent engine grant/revoke/check com expiração 12mo + audit trail. Pré-requisito pra qualquer outbound marketing. |
| `handoff-human/` (queue) | `humano/handoff-human-queue/` | new | Current `humano/transferir-para-humano/` é narrativa. novoPico add `handoff.py` com queue JSONL + idempotency (5 campos obrigatórios). Coexiste com a versão narrativa. |
| `metrics-logger/` | `metrics-logger/` | new | Current não tinha. Append-only JSONL com 14 event types + stable IDs. Base pra dashboard de qualidade que QA Tester audit cobrou. |
| `manager-summary/` | `manager-summary/` | new | Daily digest dos eventos logados pelo metrics-logger. Pareado. |
| `crm-bridge/` | `crm-bridge/` | new | Current não tinha. Local CRM: upsert_contact, create_deal, move_stage, add_note. Marcos passa a ter case lookup + deal tracking; Camila ganha ticket lookup. |
| `billing-cycle/` | `billing-cycle/` | new | Dunning engine D-3/D0/D+3/D+7. Marcos passa a poder responder timeline/atraso baseado em regra, não em "vou confirmar". |
| `payments/` | `payments/` | new | Payment link manager (Asaas/Stripe/MercadoPago/local_stub). Marcos gera links sem precisar de humano. |
| `whatsapp-inbox/` | `whatsapp-inbox/` | new | Normaliza payload Cloud API → envelope interno. Falta integração com canal whatsmeow no current — utility script standalone por enquanto. |
| `calendar-ops/` | `calendar-ops/` | new | Stub local JSON (create/update/cancel/list). Pareia com `workspace/cron/` pra appointment reminders. Sem MCP Google Calendar ainda. |
| `agent-router/` | `agent-router/` | new | Keyword routing determinístico — Skills-level router que pode ser chamado por Rafael na primeira turn pra escolher subagent. |
| `intent-routing/` | `intent-routing/` | merge | Current stub. novoPico tem confidence threshold + 6 intent types + segment-aware fallback. |

**Sanitizations aplicadas:** `memory/jotaduo/` → `memory/` em 4 substituições (kb-lookup, whatsapp-follow-up-planner) — paths novoPico-específicos neutralizados.

## Skills SKIP (current já tem paridade ou melhor)

agent-browser, github, summarize, tmux, weather, detectar-pii (já implementado), atendimento-inclusivo (guideline idêntica), memoria (current splittou em sub-skills mais granular), jotaduo-workspace-manager (single-tenant, hardcoded — não cabe na arquitetura multi-agente do current).

## Fixes da auditoria 2026-05-26 aplicados

### 1. Lia cron quebrado → consertado

`workspace/cron/jobs.json`: 2 jobs ativos (`marketing-weekly-proposals`, `marketing-monthly-positioning`) tinham `payload.agent_id: "marketing"` (agente inexistente). Patcheados para `"lia"`. Os jobs disabled (`lia-weekly-proposals`, `lia-monthly-positioning`) ficam como redundância documentacional.

### 2. Ghost agents → registrados em config.json

`workspace/config.json::agents.list` ganhou 3 entradas (Luna, Catarina, QA Tester). `agents.dispatch.rules` ganhou 6 regras (panel + pico × cada um), mesmo padrão de Clara/Marcos/etc:

```json
{"name": "orchestrator:panel:luna", "agent": "luna",
 "when": {"channel": "panel", "space": "agent:luna"}, ...}
```

Totals: 10 → 13 agents, 15 → 21 dispatch rules. Luna/Catarina/QA-Tester agora aparecem no painel admin como espaços de agente disponíveis.

**O que NÃO foi feito** (auditoria sugeriu mas o dispatcher do launcher não suporta):
- Luna roteamento por `time_range` (off-hours) — feature não existe no dispatch engine
- Catarina roteamento por `context_tag: post_discovery` — feature não existe

Pra implementar essas seriam mudanças no schema do dispatcher (Go code), fora do escopo deste batch.

### 3. Frontmatter dos agentes — adiado

Padronização de `model:`/`skills:`/`tool_allowlist:` nos 10 AGENT.md ficou pra próximo batch — exige decisão de design (quais modelos por agente, qual nível de tool sandbox).

### 4. Memory bootstrap — adiado

novoPico não tem `marca.md`/`empresa.md`/`faq.md` populados (são template-empty também), só estrutura de governance (TTL, audit, permission matrix). O `memory/MEMORY.md` template tem rules que valeria a pena adotar, mas exige decisão sobre o formato.

## Próximos passos sugeridos

1. Wire `metrics-logger` no fluxo de cada agente (insert `log_event` em handoffs, escalations, completions)
2. Wire `crm-bridge.upsert_contact` no início de cada conversa Clara/Marcos
3. Marcos: incluir `billing-cycle.compute_action` no prompt como skill default pra perguntas sobre faturamento
4. Camila: adicionar `kb-lookup.search` antes de qualquer escalation — só escala se search retornar zero matches
5. Dono: rodar manualmente `manager-summary` em fim de dia pra começar a popular relatórios e medir baseline

## Diff stats

- 15 skills novas/atualizadas
- `config.json`: +3 agents, +6 dispatch rules
- `cron/jobs.json`: 2 jobs patcheados
- 0 código fonte Go/TypeScript tocado
