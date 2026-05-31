---
name: crm-bridge
description: CRM local do tenant em SQLite — contatos/leads, deals/funil, atividades (timeline/notas) e métricas. Use para registrar e consultar quem falou com você, em que estágio está cada negócio, e os números do atendimento.
---

# crm-bridge

CRM próprio deste tenant, gravado num único arquivo SQLite no workspace
(`memory/crm/crm.db`). Cada tenant tem o seu, isolado. Você (o agente)
alimenta e consulta este CRM durante o atendimento.

Como chamar: rode `scripts/crm.py` passando **uma ação JSON no stdin**; ele
devolve **um objeto JSON no stdout**. Em erro: `{"error": "..."}` + exit≠0.
Suporta `--help`. Chaves sensíveis (password, token, secret, cpf, cnpj,
cartão…) são **rejeitadas** — nunca grave segredo aqui.

```bash
echo '{"action":"upsert_contact","email":"maria@acme.com","name":"Maria","source":"whatsapp"}' | python3 scripts/crm.py
```

## Recursos

- **contacts** — pessoas/empresas. `status`: lead | prospect | customer | lost. `source`: whatsapp | public_chat | manual | import.
- **deals** — negócios. `stage`: new | qualified | proposal | won | lost (won/lost fecham o deal). `value_cents` (inteiro, ex: R$299,00 = 29900), `currency` (default BRL).
- **activities** — timeline/notas. `type`: note | msg_in | msg_out | call | meeting | stage_change | task.
- **counters** — métricas que você incrementa (ex: conversas, mensagens) por período `YYYY-MM`.

## Ações

### Contatos
- `upsert_contact` — cria/atualiza. Identidade por `contact_id` OU `email` OU `idempotency_key`. Campos: name, email, phone, company, source, status, tags. Qualquer campo extra vira `extra` (JSON). Faz merge no update.
- `get_contact` — `{contact_id}` → contato + seus deals.
- `list_contacts` — filtros opcionais: status, source, search (nome/email/empresa/telefone), limit (≤500).

### Deals
- `create_deal` — `{idempotency_key, contact_id, title}` + opcionais stage, value_cents, currency. `idempotency_key` evita duplicar.
- `move_stage` — `{deal_id, stage}` (+ actor). Registra um `stage_change` na timeline automaticamente.
- `get_deal` — `{deal_id}`.
- `list_deals` — filtros: stage, contact_id, limit.

### Atividades
- `add_note` — `{contact_id, note}` (compat). 
- `add_activity` — `{type, body}` + contact_id e/ou deal_id (+ actor). Mais flexível.
- `list_activities` — filtros: contact_id, deal_id, type, limit.

### Métricas
- `bump_metric` — `{key}` + opcionais by (default 1), period (default mês atual). Incrementa um contador.
- `metrics` — relatório: totais, contatos por status, funil (deals por estágio), valor ganho (won), pipeline aberto, e os counters. Opcional `period` filtra os counters.

## Quando usar (orientação)

- Novo lead falou com você → `upsert_contact` (source correto) e `bump_metric` `conversas`.
- Avançou no funil → `create_deal` / `move_stage`.
- Algo relevante aconteceu → `add_activity` pra deixar rastro na timeline.
- Pediram um resumo / dashboard → `metrics`.
