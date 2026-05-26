# Cenário 03 — Triagem com Handoff para Suporte

## Objetivo
Verificar se Clara identifica um problema técnico e transfere corretamente para Camila.

## Agente(s)
- **Primário**: Clara
- **Secundário**: Camila (suporte)

## Skills esperadas
- `atendimento/triagem-inicial`
- `suporte/technical-troubleshooting`

## Diálogo (10 turnos)

---
**T01**
🧑 *Bom dia. Estou com um problema no sistema.*

🤖 Clara: Bom dia. Pode me dizer qual problema está enfrentando?

---
**T02**
🧑 *O sistema está muito lento desde ontem.*

🤖 Clara: Entendo. Você é cliente nosso? Qual é o nome da empresa?

---
**T03**
🧑 *Sim, sou Bruno Costa, da Distribuidora Costa.*

🤖 Clara: Olá, Bruno. A lentidão está afetando alguma área específica do sistema?

---
**T04**
🧑 *Todo o sistema. Fica travando na hora de emitir nota fiscal.*

🤖 Clara: Entendido. Isso está impactando sua operação agora?

---
**T05**
🧑 *Sim, é crítico. Não consigo emitir nada.*

🤖 Clara: Compreendo a urgência. Vou te conectar agora com Camila, nossa especialista de suporte, para resolver isso com prioridade.

---
**[HANDOFF: Clara → Camila]**

---
**T06**
🤖 Camila: Olá, Bruno. Sou Camila, do suporte técnico. Fui informada sobre a lentidão crítica na emissão de nota fiscal. Você consegue me dizer desde quando exatamente o problema começou?

---
**T07**
🧑 *Desde ontem às 14h, após uma atualização.*

🤖 Camila: Entendido. Houve alguma atualização de sistema ou mudança no ambiente ontem antes das 14h?

---
**T08**
🧑 *Sim, atualizaram o servidor.*

🤖 Camila: Isso ajuda muito a identificar a causa. Vou registrar um chamado de prioridade alta e acionar nossa equipe técnica. Você receberá atualizações a cada hora. Tem um número de contato para o técnico ligar?

---
**T09**
🧑 *Sim, pode ligar para +55 21 98765-4321.*

🤖 Camila: Anotado. Chamado registrado com prioridade P1. Nossa equipe entrará em contato em até 30 minutos. Precisa de mais alguma coisa enquanto isso?

---
**T10**
🧑 *Não, obrigado. Aguardo o contato.*

🤖 Camila: Perfeito. Fique tranquilo, Bruno. Vamos resolver isso.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara identificou urgência crítica | Sim | |
| Handoff imediato para Camila | Sim, sem demorar | |
| Camila não repetiu dados já coletados | Confirmou, não repetiu | |
| Camila coletou info técnica relevante (quando/o que mudou) | Sim | |
| Chamado P1 registrado | Sim | |
| SLA comunicado ao cliente | Sim (30 min) | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
