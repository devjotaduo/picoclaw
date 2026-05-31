# CRM Schema (SQLite, por tenant)

Arquivo: `memory/crm/crm.db`. WAL + busy_timeout=10s + foreign_keys ON.
Criado sob demanda no primeiro uso. Importa uma vez o JSON legado
`memory/jotaduo/crm/records.json` se existir (marcado pelo counter interno
`_legacy_imported`, oculto do relatório `metrics`).

## Tabelas

### contacts
| coluna | tipo | notas |
|---|---|---|
| id | TEXT PK | `contact_<sha16>` derivado de email/idempotency, ou fornecido |
| name, email, phone, company | TEXT | livres |
| source | TEXT | whatsapp \| public_chat \| manual \| import (default manual) |
| status | TEXT | lead \| prospect \| customer \| lost (default lead) — **validado** |
| tags | TEXT | csv livre |
| extra_json | TEXT | campos extras arbitrários (merge no update) |
| created_at, updated_at | TEXT | ISO-8601 |

Índices: status, email.

### deals
| coluna | tipo | notas |
|---|---|---|
| id | TEXT PK | `deal_<sha16>` de idempotency_key |
| contact_id | TEXT | FK lógica → contacts.id (validada na criação) |
| title | TEXT | |
| stage | TEXT | new \| qualified \| proposal \| won \| lost (default new) — **validado** |
| value_cents | INTEGER | valor em centavos |
| currency | TEXT | default BRL |
| created_at, updated_at | TEXT | |
| closed_at | TEXT | setado quando stage vira won/lost |

Índices: contact_id, stage.

### activities (timeline / notas)
| coluna | tipo | notas |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| contact_id, deal_id | TEXT | um dos dois obrigatório |
| type | TEXT | note \| msg_in \| msg_out \| call \| meeting \| stage_change \| task — **validado** |
| body | TEXT | até 4000 chars, newlines preservados |
| actor | TEXT | quem registrou (nome do agente / "lead") |
| created_at | TEXT | |

`move_stage` insere um `stage_change` automaticamente (`body = "old -> new"`).

### counters (métricas incrementais)
| coluna | tipo | notas |
|---|---|---|
| key | TEXT | PK parte 1 — keys começando com `_` são internas/ocultas |
| period | TEXT | PK parte 2 — `YYYY-MM` ou `all` |
| value | INTEGER | |
| updated_at | TEXT | |

## Relatório `metrics`

Agrega ao vivo: totais (contacts/deals/activities), contacts_by_status,
deals_by_stage (funil), won (count+value_cents), open_pipeline (estágios
≠ won/lost), e os counters públicos.

## Segurança / LGPD

- Chaves sensíveis (password, token, secret, api_key, private_key, cpf,
  cnpj, card_number, cvv) são rejeitadas em qualquer nível do payload.
- Texto é higienizado (strip de tags HTML e control-chars) antes de gravar.
- Isolamento é por container: o tenant só acessa o próprio `crm.db`.
