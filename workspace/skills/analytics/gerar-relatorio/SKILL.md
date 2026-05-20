---
name: gerar-relatorio
description: Gera relatório analítico diário ou semanal das conversas WhatsApp registradas no ledger.
agents:
  - rafael
  - lia
---

# Skill: Gerar Relatório

## Como usar

Chame o endpoint REST para obter o relatório em JSON:

```
GET /api/analytics/report?period=daily&date=2026-05-20
GET /api/analytics/report?period=weekly&week=2026-W20
```

## Campos do relatório diário

| Campo | Descrição |
|---|---|
| total_turns | Total de turnos do agente no dia |
| unique_contacts | Contatos únicos (SenderID distintos) |
| unique_sessions | Sessões distintas |
| avg_turn_duration_ms | Latência média de resposta |
| peak_hour | Hora UTC de maior volume (0-23) |
| by_agent | Turnos por agente |
| by_channel | Turnos por canal |
| tag_counts | Contagem por tag (question, complaint…) |

## Exemplos de ação

- Rafael: "Ontem tivemos 47 atendimentos, pico às 14h, 3 reclamações."
- Lia: "Esta semana, 12 conversas sobre produto X — sugerir campanha."
