---
name: intent-routing
description: Classificar a intenção do cliente em uma das categorias da empresa (dúvida, reclamação, orçamento, suporte, financeiro, parceria, urgência, agendamento) antes de qualquer ação. Ativar no início de cada conversa ou quando o tópico mudar, para decidir o próximo passo (responder direto, coletar dados, encaminhar, escalar urgência).
---

# Intent Routing

## Princípios

- Classificar antes de agir. Resposta errada nasce de intenção mal lida.
- Quando a intenção for ambígua, perguntar uma vez de forma direta — não chutar.
- Urgência ou risco têm prioridade sobre qualquer outra classificação.

## Categorias padrão

- **dúvida**: pergunta institucional ou sobre serviços/produtos
- **reclamação**: problema, insatisfação, pedido de correção
- **orçamento**: pedido comercial de preço/proposta
- **suporte**: problema técnico ou operacional já em uso
- **financeiro**: cobrança, pagamento, segunda via, devolução
- **parceria**: proposta B2B, fornecedor, integração
- **agendamento**: marcar/remarcar/cancelar
- **urgência**: risco imediato, ameaça jurídica, exposição de dados

## Workflow

1. Ler a mensagem do cliente (já tendo passado por `memory-and-knowledge-check`).
2. Identificar palavras-chave e contexto. Cruzar com a categoria mais provável.
3. Se a categoria for clara → seguir o fluxo correspondente (responder, coletar dados, encaminhar).
4. Se a categoria for ambígua → fazer **uma** pergunta de esclarecimento ("Posso te ajudar com mais agilidade se souber: é uma dúvida, uma reclamação ou um pedido novo?").
5. Se houver sinais de urgência ou risco, classificar como urgência e seguir o fluxo de escalação imediatamente.

## Exemplos

**Cenário**: "Comprei ontem e ainda não chegou"
- ✅ Classificar como **suporte/reclamação** (problema de entrega), pular para o fluxo correspondente.
- ❌ Responder "Obrigado pela compra!" sem ler a intenção.

**Cenário**: "Vocês trabalham com integração via API?"
- ✅ Classificar como **parceria** ou **dúvida técnica** — encaminhar para o setor responsável.
- ❌ Tentar dar uma resposta técnica genérica.

**Cenário**: "Estou com dor forte no peito"
- ✅ Classificar como **urgência** imediatamente — orientar busca por pronto-socorro/192.
- ❌ Pedir mais detalhes antes de orientar atendimento de emergência.

## Encaminhamento

Encaminhar à equipe responsável quando:
- A intenção combinar duas ou mais categorias críticas (ex.: reclamação + urgência).
- A pessoa demonstrar forte insatisfação ou ameaça jurídica logo no primeiro turno.
- A categoria detectada não tem fluxo automatizado configurado.
