---
name: sugerir-faq
description: Com base nos padrões detectados, sugere novas entradas para memory/faq.md.
agents:
  - rafael
---

# Skill: Sugerir FAQ

## Fluxo

1. Chamar skill identificar-padroes para obter top_faq_candidates.
2. Para cada candidato com count ≥ 5:
   - Formatar como entrada de FAQ.
   - Propor ao dono via mensagem WhatsApp.
   - Aguardar aprovação antes de gravar em memory/faq.md.

## Formato de entrada FAQ

```markdown
## Pergunta: [texto normalizado]

**Resposta**: [resposta sugerida pelo agente]

*Frequência detectada*: X vezes na semana YYYY-Www
```

## Regras

- Nunca gravar sem aprovação do dono.
- Incluir data de detecção.
- Marcar como rascunho até aprovado.
