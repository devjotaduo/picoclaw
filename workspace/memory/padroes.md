# Padrões Detectados

Cache dos últimos padrões comportamentais detectados nas conversas WhatsApp.
Rafael usa este arquivo para alertas proativos ao dono.

## Como detectar

```
GET /api/analytics/patterns?week=YYYY-Www
```

## Último relatório de padrões

<!-- Rafael atualiza esta seção toda segunda-feira após execução do cron -->

**Semana**: —  
**Gerado em**: —

### Horários de pico

Nenhum dado ainda.

### FAQ Candidatas

Nenhum dado ainda.

### Latência por agente

Nenhum dado ainda.

### Sentimento

Score: — (escala -1 negativo … +1 positivo)

### Distribuição de tags

Nenhum dado ainda.

---

## Ações tomadas

<!-- Rafael documenta aqui ações disparadas com base nos padrões -->

| Data | Padrão | Ação tomada |
|---|---|---|
| — | — | — |

---

## Regras de alerta Rafael

- Sentimento < -0.3 → alertar dono imediatamente.
- FAQ candidata com count ≥ 5 → chamar skill `sugerir-faq`.
- Pico fora do horário comercial → informar dono.
- Latência P95 > 10 000 ms → investigar gargalo.

---
*Atualizado automaticamente toda segunda-feira às 06h (cron analytics-pattern-weekly).*
