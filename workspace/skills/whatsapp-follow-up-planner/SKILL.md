---
name: whatsapp-follow-up-planner
description: Planejar retornos de WhatsApp para orçamento, pagamento, entrega, abandono, pós-venda e pendências. Ativar quando houver próxima ação futura, promessa de retorno, lead aguardando resposta ou atendimento que não terminou.
version: 1.0.0
language: pt-br
---

# WhatsApp Follow-up Planner

## Workflow

1. Identifique o motivo do retorno: orçamento, disponibilidade, entrega, pagamento, reclamação, pós-venda ou lead parado.
2. Defina quando retornar com base na urgência e no horário comercial.
3. Escreva uma próxima ação curta e objetiva.
4. Se faltar dado essencial, planeje coletar esse dado primeiro.
5. Não agende retorno para promessa que depende de aprovação sem deixar isso claro.

## Saída Esperada

```json
{
  "follow_up_at": "",
  "follow_up_reason": "",
  "next_action": "",
  "owner": ""
}
```

## Regras

- Para orçamento quente, retorno no mesmo dia útil.
- Para reclamação, retorno apenas com contexto e responsável claro.
- Para pós-venda, não reabra conversa se o cliente pediu para não receber contato.
