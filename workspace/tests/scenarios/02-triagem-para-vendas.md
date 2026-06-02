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

## Diálogo (20 turnos)

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

**T13**
🧑 *Vai ter contrato para assinar?*

🤖 Marcos: Sim. Vou incluir os termos do plano na proposta. Você prefere contrato digital ou impresso?

---

**T14**
🧑 *Digital está ótimo.*

🤖 Marcos: Perfeito. Envio a proposta e o link para assinatura digital juntos.

---

**T15**
🧑 *E se eu quiser aumentar para mais agentes depois?*

🤖 Marcos: O upgrade é simples. Você pode migrar para o Plano Business a qualquer momento sem perder a configuração atual.

---

**T16**
🧑 *O suporte é por WhatsApp também?*

🤖 Marcos: O suporte do Plano Starter é por e-mail. No Business, o suporte é prioritário. Vou detalhar isso na proposta também.

---

**T17**
🧑 *Ok. E quanto tempo leva para ativar o sistema?*

🤖 Marcos: Nossa equipe faz a configuração com você após a contratação. Vou verificar o prazo exato e incluir na proposta.

---

**T18**
🧑 *Ótimo. Fico no aguardo.*

🤖 Marcos: Combinado, Carla. Qualquer dúvida antes de receber a proposta, pode me chamar aqui.

---

**T19**
🧑 *Uma última coisa: posso conectar o Instagram também?*

🤖 Marcos: Vou verificar essa funcionalidade e incluir a resposta na proposta. Quero te passar informação confirmada, não estimativa.

---

**T20**
🧑 *Obrigada, Marcos.*

🤖 Marcos: Por nada. Até amanhã, Carla!

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara identificou intenção de compra | Sim | PASS |
| Handoff ocorreu para Marcos | Sim, com contexto | PASS |
| Marcos não repetiu perguntas já feitas | Sim (confirmou, não repetiu) | PASS |
| BANT aplicado por Marcos | B(orçamento) A(autoridade implícita) N(necessidade) T(tempo implícito) | PASS |
| Plano sugerido coerente com orçamento | Starter (R$297) ≤ R$500 | PASS |
| Nenhum preço inventado | Starter = R$ 297/mês conforme fixtures | PARCIAL |
| Tom mantido na transição | Profissional e natural | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 7,5
- **Observações**: Fluxo Clara→Marcos coeso. Marcos eficiente no BANT, mas citou preço sem confirmar via memory/vendas.md. Recomenda-se que Marcos consulte a memória antes de informar valores ao cliente.
- **Observações**: —
