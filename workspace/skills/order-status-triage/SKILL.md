---
name: order-status-triage
description: Identificar a intenção de um contato de loja/e-commerce — dúvida sobre produto, status de pedido, troca/devolução, problema de entrega, reclamação ou pós-venda — e direcionar para o fluxo correto. Ativar no início de qualquer conversa de varejo, antes de expor dados de pedido ou aceitar pedidos de alteração. Validar identidade antes de mostrar qualquer dado de pedido (`customer-identity-verification`).
version: 1.0.0
language: pt-br
---

# Order Status Triage

## Princípios

- Antes de expor dados de pedido (status, endereço, valores), validar identidade. Nunca expor por nome de cliente solto.
- Identificar a intent antes de prometer prazos ou ações.
- Dados de entrega vêm da transportadora — não inventar status.

## Intents e dados mínimos

| Intent              | Dados mínimos                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| dúvida de produto   | nome ou SKU do produto                                                        |
| status de pedido    | nº do pedido OU email/CPF do cliente + identidade confirmada                  |
| troca/devolução     | nº do pedido + motivo + evidência se houver                                   |
| problema de entrega | nº do pedido + data prevista + descrição do problema + endereço cadastrado    |
| reclamação          | nº do pedido (se aplicável) + descrição + impacto + expectativa               |

## Workflow

1. Cumprimentar e perguntar como pode ajudar.
2. Classificar a intent a partir da resposta.
3. Para qualquer intent que envolva dados de pedido → exigir identificação (`customer-identity-verification`).
4. Coletar os campos mínimos da intent. Não pedir tudo de uma vez.
5. Direcionar para o fluxo correspondente:
   - dúvida de produto → consultar catálogo (módulo de Produtos) e responder.
   - status de pedido → consultar sistema oficial; nunca chutar prazo.
   - troca/devolução → acionar `returns-and-refunds-policy`.
   - problema de entrega → registrar, encaminhar para logística com resumo completo.
   - reclamação → registrar e escalar conforme severidade.

## Exemplos

**Cenário**: "Cadê meu pedido?"
- ✅ "Posso te ajudar. Pode me passar o número do pedido OU seu email cadastrado?"
- ❌ "Vou verificar..." sem coletar nada.

**Cenário**: "O produto chegou defeituoso."
- ✅ Intent: troca. Coletar nº do pedido, descrição do defeito, foto se possível → encaminhar para `returns-and-refunds-policy`.
- ❌ Prometer reembolso na hora sem validar política.

**Cenário**: "Vocês vendem o modelo XPTO?"
- ✅ Intent: dúvida de produto. Consultar módulo de Produtos. Se está no catálogo, responder com detalhes e valor. Se não está: "Esse modelo não está no nosso catálogo atual."
- ❌ "Acho que sim, deixa eu confirmar..." sem checar.

## Encaminhamento

Encaminhar à equipe responsável quando:
- Reclamação envolver ameaça jurídica, risco reputacional ou alto valor.
- Pedido de exceção (reembolso fora do prazo, troca fora da política).
- Suspeita de fraude (dados inconsistentes, várias tentativas com perfis diferentes).
- Logística reportar problema que exige humano (extravio, devolução não recebida).
