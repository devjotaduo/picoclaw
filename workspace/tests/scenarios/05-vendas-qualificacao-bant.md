# Cenário 05 — Vendas: Qualificação BANT/SPIN

## Objetivo
Verificar se Marcos aplica corretamente o framework BANT/SPIN para qualificar um lead.

## Agente(s)
- **Primário**: Marcos (consultor de vendas)

## Skills esperadas
- `vendas/bant-spin-discovery`
- `vendas/lead-qualification`

## Diálogo (20 turnos)

---
**T01**
🤖 Marcos: Olá! Sou Marcos, consultor de soluções. Clara me passou seu contato. Você está avaliando uma solução de automação para sua empresa, certo?

---
**T02**
🧑 *Isso. Tenho uma clínica e quero automatizar o atendimento.*

🤖 Marcos: Entendo. Quantas pessoas trabalham no atendimento hoje na clínica?

---
**T03**
🧑 *Somos 4 atendentes.*

🤖 Marcos: E qual é o maior problema que vocês enfrentam hoje no atendimento?

---
**T04**
🧑 *Muitas mensagens no WhatsApp e não conseguimos responder a tempo.*

🤖 Marcos: Isso é muito comum. Quantas mensagens por dia aproximadamente?

---
**T05**
🧑 *Umas 150 a 200 por dia.*

🤖 Marcos: Volume considerável. Além do tempo de resposta, tem algum outro problema — como agendamentos errados, clientes sem retorno?

---
**T06**
🧑 *Sim, perdemos muito agendamento por falta de resposta rápida.*

🤖 Marcos: Faz todo sentido. Você tem ideia de quanto isso representa em receita perdida por mês?

---
**T07**
🧑 *Não sei ao certo, mas deve ser uns R$ 3 a 4 mil.*

🤖 Marcos: É um impacto real. Você tem algum orçamento definido para resolver isso?

---
**T08**
🧑 *Tenho disponível uns R$ 600 a R$ 700 por mês.*

🤖 Marcos: Perfeito, cabe bem no Plano Business. Você é quem decide sobre a contratação ou precisa consultar alguém?

---
**T09**
🧑 *Sou eu mesma.*

🤖 Marcos: Ótimo. E você tem algum prazo para implementar?

---
**T10**
🧑 *Quero em funcionamento em 30 dias.*

🤖 Marcos: 30 dias é totalmente viável. Com o Plano Business, você teria até 10 agentes configurados, 10 mil mensagens/mês e suporte prioritário — mais do que suficiente para sua operação. Quer que eu prepare uma demonstração?

---
**T11**
🧑 *Sim, quero ver funcionando antes de fechar.*

🤖 Marcos: Combinado. Vou agendar uma demo de 30 minutos. Qual horário funciona melhor para você esta semana?

---
**T12**
🧑 *Quinta-feira às 10h.*

🤖 Marcos: Perfeito. Quinta às 10h confirmado. Vou enviar o link de acesso por e-mail. Pode me confirmar seu e-mail?

---

**T13**
🧑 *minha.clinica@gmail.com.*

🤖 Marcos: Perfeito. Link de acesso à demo enviado para minha.clinica@gmail.com. Confirmo também por aqui quinta às 10h.

---

**T14**
🧑 *Na demo vou ver como o sistema responde automaticamente?*

🤖 Marcos: Sim. Você vai ver os agentes em funcionamento, como é feita a triagem de mensagens, o encaminhamento para especialistas e como o sistema registra as interações.

---

**T15**
🧑 *E posso testar enviar uma mensagem como se fosse paciente?*

🤖 Marcos: Com certeza. A demo é interativa — você vai poder simular situações reais da sua clínica.

---

**T16**
🧑 *Ótimo. E se depois da demo eu quiser contratar na hora?*

🤖 Marcos: Posso preparar o contrato digital na sequência da demo para você assinar na hora, se quiser. Não há necessidade de esperar.

---

**T17**
🧑 *Tem desconto para clínicas de saúde?*

🤖 Marcos: Não tenho condição especial cadastrada para esse segmento no momento. Se houver alguma promoção ativa, vou verificar antes da demo e te informo.

---

**T18**
🧑 *Tá bom. E se eu precisar cancelar antes da demo?*

🤖 Marcos: Sem problema. Basta me avisar com pelo menos 2 horas de antecedência e reagendamos.

---

**T19**
🧑 *Combinado. Obrigada, Marcos.*

🤖 Marcos: Obrigado pela confiança. Até quinta às 10h!

---

**T20**
🧑 *Uma última coisa: quantas pessoas podem participar da demo?*

🤖 Marcos: Não há limite. Se quiser incluir algum sócio ou gerente, pode compartilhar o link que vou enviar.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Budget investigado | Sim (R$600-700/mês) | PASS |
| Authority verificada | Sim (decisora) | PASS |
| Need aprofundada | Sim (volume + perda de receita) | PASS |
| Timeline definida | Sim (30 dias) | PASS |
| Plano sugerido coerente com budget | Business (R$697) ≤ R$700 | PASS |
| Não fechou venda sem autorização | Sim (propôs demo, não forçou fechamento) | PASS |
| Calculou impacto financeiro com cliente | Sim (R$3-4k/mês perdidos) | PARCIAL |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 8,0
- **Observações**: BANT aplicado com naturalidade e profundidade. Marcos citou preço do Business sem confirmar via memória — recomendável checar memory/vendas.md antes de informar valores. Cálculo de impacto financeiro foi estimativa, não valor confirmado.
