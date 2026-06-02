# Cenário 19 — Fluxo Completo: Atendimento → Vendas → Rafael

## Objetivo
Testar o fluxo end-to-end de um novo cliente desde a triagem até o fechamento com acompanhamento do Rafael.

## Agente(s)
- Clara → Marcos → Rafael (3 agentes em sequência)

## Skills esperadas
- `atendimento/triagem-inicial`
- `vendas/bant-spin-discovery`
- `vendas/lead-qualification`
- `memoria/atualizar-memoria`

## Total de interações: 20 turnos

---
### FASE 1: Triagem (Clara) — Turnos 1–6

**T01**
🧑 *Olá! Vi vocês no Instagram e quero saber mais.*

🤖 Clara: Olá! Fico feliz em ajudar. Qual é o seu nome e empresa?

---
**T02**
🧑 *Lucas Martins, loja de eletrônicos LM Tech.*

🤖 Clara: Olá, Lucas. O que você está buscando — atendimento automático, vendas, suporte, ou outra coisa?

---
**T03**
🧑 *Quero automatizar o WhatsApp. Recebo muita mensagem e não consigo responder a tempo.*

🤖 Clara: Entendo. Qual é o volume de mensagens por dia aproximadamente?

---
**T04**
🧑 *Umas 80 a 100 por dia.*

🤖 Clara: Bom volume. Para mostrar as opções certas para você, vou te conectar com nosso consultor de soluções. Um momento.

---
**[HANDOFF: Clara → Marcos]**

---
### FASE 2: Qualificação de Vendas (Marcos) — Turnos 5–14

**T05**
🤖 Marcos: Olá, Lucas! Sou Marcos. Clara me passou que você recebe umas 80 a 100 mensagens/dia na LM Tech e quer automatizar o WhatsApp. Hoje você fecha vendas pelo WhatsApp também?

---
**T06**
🧑 *Sim, pelo menos metade das vendas passa pelo WhatsApp.*

🤖 Marcos: E o que acontece quando você não responde a tempo?

---
**T07**
🧑 *O cliente vai para o concorrente.*

🤖 Marcos: Faz todo sentido. Você tem ideia de quanto isso representa por mês?

---
**T08**
🧑 *Difícil calcular, mas acho que uns R$ 5 a 8 mil.*

🤖 Marcos: Esse é exatamente o problema que resolvemos. Tem orçamento definido?

---
**T09**
🧑 *Uns R$ 600 a R$ 700.*

🤖 Marcos: Perfeito para o Plano Business. Você é o decisor para essa contratação?

---
**T10**
🧑 *Sim, sou o dono.*

🤖 Marcos: E tem algum prazo para ter isso rodando?

---
**T11**
🧑 *Quero para o mês que vem.*

🤖 Marcos: Totalmente viável. O Plano Business por R$ 697/mês inclui 10 agentes, 10 mil mensagens e suporte prioritário. Quer que eu prepare a proposta formal?

---
**T12**
🧑 *Pode preparar.*

🤖 Marcos: Qual e-mail para enviar?

---
**T13**
🧑 *lucas@lmtech.com.br*

🤖 Marcos: Perfeito. Proposta enviada até amanhã de manhã. Posso ligar quinta para tirar dúvidas?

---
**T14**
🧑 *Pode ser.*

🤖 Marcos: Combinado, Lucas. Falo com você quinta. Rafael, estou passando o lead LM Tech para acompanhamento.

---
**[HANDOFF: Marcos → Rafael]**

---
### FASE 3: Acompanhamento (Rafael) — Turnos 15–20

**T15**
🤖 Rafael: Recebi o lead LM Tech da parte do Marcos. Vou registrar na memória: Lucas Martins, 80-100 msg/dia, orçamento R$600-700, Plano Business, prazo 30 dias, proposta enviando amanhã.

---
**T16**
🧑 *Rafael, quando foi o último contato com a LM Tech?*

🤖 Rafael: Primeiro contato hoje. Próximo follow-up: quinta-feira (Marcos). Proposta sendo preparada.

---
**T17**
🧑 *Ok. E o status do pipeline de vendas esta semana?*

🤖 Rafael: Pipeline desta semana:
- LM Tech [Marcos]: proposta enviando amanhã, follow-up quinta
- Vitrine Moda [Marcos]: aguardando decisão com marido
- Clínica Bella Vida [Marcos]: demo agendada quinta 10h

---
**T18**
🧑 *Algum lead quente?*

🤖 Rafael: LM Tech é o mais quente: decisor identificado, orçamento confirmado, prazo definido. Clínica Bella Vida também — demo agendada é sinal forte.

---
**T19**
🧑 *Bom trabalho. Qual a prioridade para amanhã?*

🤖 Rafael: 1. Enviar proposta LM Tech. 2. Preparar demo Clínica Bella Vida. 3. Retornar Diego Ferreira (cancelamento em aberto — Camila está tratando).

---
**T20**
🧑 *Perfeito. Obrigado, Rafael.*

🤖 Rafael: Disponha.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara identificou intenção e fez handoff | Sim | PASS |
| Marcos não repetiu dados coletados por Clara | Sim | PASS |
| BANT completo aplicado por Marcos | Sim | PASS |
| Marcos não fechou venda sem proposta formal | Sim | PASS |
| Rafael registrou lead na memória | Sim | PARCIAL |
| Rafael consolidou pipeline corretamente | Sim (citou 3 leads ativos) | PASS |
| Fluxo de 3 agentes coeso | Sim | PASS |
| Tom mantido em todos os turnos | Sim (profissional, natural) | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 8,5
- **Observações**: Fluxo de 3 agentes coeso e natural. Rafael citou leads ativos sem indicar que consultou a memória — deve sempre explicitar "Consultando memory/leads.md..." antes de apresentar dados do pipeline.
