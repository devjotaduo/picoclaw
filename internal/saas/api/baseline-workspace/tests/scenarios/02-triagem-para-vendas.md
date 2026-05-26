# Cenário 02 — Triagem com Handoff para Vendas

## Objetivo
Verificar se Clara identifica intenção de compra e transfere corretamente para Marcos.

## Agente(s)
- **Primário**: Clara (triagem)
- **Secundário**: Marcos (vendas)

## Skills esperadas
- `atendimento/triagem-inicial`
- `vendas/lead-qualification`
- `vendas/bant-spin-discovery`

## Diálogo (12 turnos)

---

**T01**
🧑 *Olá! Quero contratar o sistema de vocês.*

🤖 Clara: Olá! Fico feliz em ajudar. Pode me dizer seu nome e empresa?

---

**T02**
🧑 *Sou Carla Mendes, da Loja Vitrine Moda.*

🤖 Clara: Olá, Carla. O que você precisa automatizar na Vitrine Moda?

---

**T03**
🧑 *Quero automatizar o atendimento no WhatsApp e também as vendas pelo Instagram.*

🤖 Clara: Entendo. Você já tem alguma solução hoje ou seria do zero?

---

**T04**
🧑 *Do zero. Vi vocês no Instagram e me interessei.*

🤖 Clara: Que bom! Quantas pessoas atendem hoje pelo WhatsApp?

---

**T05**
🧑 *Só eu mesma, umas 50 mensagens por dia.*

🤖 Clara: Certo. Para entender melhor as opções ideais para você, vou te conectar com nosso consultor de vendas. Um momento.

---

**[HANDOFF: Clara → Marcos]**

---

**T06**
🤖 Marcos: Olá, Carla! Sou Marcos, consultor de soluções. Clara me passou seu interesse. Você está buscando automatizar o atendimento no WhatsApp e também as vendas pelo Instagram, certo?

---

**T07**
🧑 *Isso mesmo. Quero parar de responder tudo na mão.*

🤖 Marcos: Faz todo sentido. Hoje, além do atendimento, você fecha vendas pelo WhatsApp também?

---

**T08**
🧑 *Sim, a maioria das vendas é por lá.*

🤖 Marcos: E qual é o volume de pedidos por semana hoje?

---

**T09**
🧑 *Umas 30 a 40 por semana.*

🤖 Marcos: Bom volume. E tem algum orçamento mensal em mente para essa solução?

---

**T10**
🧑 *Uns R$ 400 a R$ 500 por mês.*

🤖 Marcos: Perfeito. Nosso Plano Starter atende bem esse perfil. Quer que eu te explique o que está incluído?

---

**T11**
🧑 *Sim, por favor.*

🤖 Marcos: O Plano Starter inclui até 3 agentes configurados, 1000 mensagens por mês, integração com WhatsApp e suporte por e-mail. Para o volume que você mencionou, seria suficiente para começar. Posso te enviar uma proposta formal por e-mail?

---

**T12**
🧑 *Pode sim. Meu e-mail é carla@vitrinemoda.com.*

🤖 Marcos: Anotado, Carla. Vou preparar a proposta e enviar até amanhã. Qualquer dúvida, pode me chamar aqui.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara identificou intenção de compra | Sim | |
| Handoff ocorreu para Marcos | Sim, com contexto | |
| Marcos não repetiu perguntas já feitas | Sim (confirmou, não repetiu) | |
| BANT aplicado por Marcos | B(orçamento) A(autoridade implícita) N(necessidade) T(tempo implícito) | |
| Plano sugerido coerente com orçamento | Starter (R$297) ≤ R$500 | |
| Nenhum preço inventado | Starter = R$ 297/mês conforme fixtures | |
| Tom mantido na transição | Profissional e natural | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
- **Observações**: —
