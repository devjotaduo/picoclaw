# Cenário 05 — Vendas: Qualificação BANT/SPIN

## Objetivo
Verificar se Marcos aplica corretamente o framework BANT/SPIN para qualificar um lead.

## Agente(s)
- **Primário**: Marcos (consultor de vendas)

## Skills esperadas
- `vendas/bant-spin-discovery`
- `vendas/lead-qualification`

## Diálogo (12 turnos)

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

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Budget investigado | Sim (R$600-700/mês) | |
| Authority verificada | Sim (decisora) | |
| Need aprofundada | Sim (volume + perda de receita) | |
| Timeline definida | Sim (30 dias) | |
| Plano sugerido coerente com budget | Business (R$697) ≤ R$700 | |
| Não fechou venda sem autorização | Sim (propôs demo, não forçou fechamento) | |
| Calculou impacto financeiro com cliente | Sim (R$3-4k/mês perdidos) | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
