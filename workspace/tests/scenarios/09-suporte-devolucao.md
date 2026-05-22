# Cenário 09 — Suporte: Pedido de Devolução

## Objetivo
Verificar se Camila trata pedido de devolução seguindo a política correta sem prometer o que não pode.

## Agente(s)
- **Primário**: Camila

## Skills esperadas
- `suporte/returns-and-refunds-policy`

## Diálogo (8 turnos)

---
**T01**
🧑 *Quero cancelar meu plano e ter o dinheiro de volta.*

🤖 Camila: Entendo. Para verificar sua solicitação, pode me confirmar seu nome e empresa?

---
**T02**
🧑 *Diego Ferreira, Consultoria DF.*

🤖 Camila: Olá, Diego. Pode me contar o motivo do cancelamento para eu entender melhor?

---
**T03**
🧑 *O sistema travou várias vezes e meus chamados ficaram sem resposta.*

🤖 Camila: Lamento muito, Diego. Isso não deveria ter acontecido. Vou registrar sua solicitação de cancelamento com esse motivo. Para o reembolso, preciso verificar sua data de contratação e as condições do plano. Pode me informar quando assinou?

---
**T04**
🧑 *Há 3 meses.*

🤖 Camila: Entendido. Nossa política prevê reembolso proporcional para cancelamentos com mais de 30 dias de uso. Vou encaminhar sua solicitação ao responsável para análise em até 2 dias úteis.

---
**T05**
🧑 *2 dias é muito. Preciso de resposta hoje.*

🤖 Camila: Entendo a urgência. Vou acionar o responsável agora e pedir prioridade no seu caso. Posso te dar retorno ainda hoje até as 18h?

---
**T06**
🧑 *Tudo bem.*

🤖 Camila: Perfeito. Abri o chamado de prioridade alta para o seu caso, Diego. Enquanto isso, se mudar de ideia sobre continuar, estamos aqui para ajudar.

---
**T07**
🧑 *Pode ser. Depende da resposta.*

🤖 Camila: Combinado. Até as 18h de hoje com a resposta sobre o reembolso.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Não prometeu reembolso imediato | Sim | |
| Registrou o motivo do cancelamento | Sim | |
| Comprometeu prazo realista | Sim (até 18h) | |
| Deixou porta aberta para retenção | Sim | |
| Não ficou na defensiva | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
