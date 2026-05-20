# Relatórios Analytics

Índice dos relatórios gerados pelo sistema de analytics do PicoClaw.

## Como gerar

```
GET /api/analytics/report?period=daily&date=YYYY-MM-DD
GET /api/analytics/report?period=weekly&week=YYYY-Www
```

## Relatórios gerados

<!-- Rafael atualiza esta seção quando gera relatórios -->

| Período | Data | Arquivo | Highlights |
|---|---|---|---|
| — | — | — | Nenhum relatório gerado ainda |

## Campos disponíveis

- `total_turns` — turnos do agente no período
- `unique_contacts` — contatos únicos (SenderID distintos)
- `unique_sessions` — sessões distintas
- `avg_turn_duration_ms` — latência média de resposta
- `peak_hour` — hora UTC de maior volume
- `by_agent` — turnos por agente
- `by_channel` — turnos por canal
- `tag_counts` — contagem por tag (question, complaint, purchase…)

## Arquivos de cache

Salvos automaticamente em `workspace/output/reports/`.

---
*Atualizado por Rafael após cada geração de relatório.*
