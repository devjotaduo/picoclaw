---
name: identificar-padroes
description: Analisa padrões comportamentais nas conversas WhatsApp da semana (FAQ, horários de pico, sentimento, latência por agente).
agents:
  - rafael
---

# Skill: Identificar Padrões

## Como usar

```
GET /api/analytics/patterns?week=2026-W20
```

## Padrões detectados

| Padrão | Descrição |
|---|---|
| peak_hours | Top-5 horas UTC com maior volume |
| top_faq_candidates | Perguntas mais frequentes (proxy por agente/tag) |
| agent_latency_p50/p95 | Percentis de latência por agente |
| sentiment_score | Score -1 (negativo) a +1 (positivo) com wordlist PT-BR |
| tag_distribution | Distribuição de tags na semana |

## Ações sugeridas

- Se sentimento < -0.3: alertar dono, revisar atendimento.
- Se pico inesperado: verificar campanha ativa.
- Se FAQ candidatas > 5: chamar skill sugerir-faq.
