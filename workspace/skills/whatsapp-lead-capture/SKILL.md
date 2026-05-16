---
name: whatsapp-lead-capture
description: Identificar e qualificar leads vindos pelo WhatsApp. Extrai interesse, produto/serviço, urgência, orçamento, decisor, estágio do funil e fit comercial. Ativar quando a pessoa pede preço, orçamento, compra, proposta, disponibilidade, entrega ou demonstra intenção comercial.
---

# WhatsApp Lead Capture

## Workflow

1. Classifique o estágio: `novo`, `interessado`, `qualificado`, `proposta`, `negociacao`, `follow_up`, `sem_fit`.
2. Colete uma pergunta por vez: necessidade, quantidade, prazo, local de entrega, orçamento ou decisor.
3. Marque como `qualificado` quando houver interesse claro, produto/serviço definido e próximo passo comercial.
4. Gere um resumo para o time comercial com dor, interesse, urgência, objeções e próxima ação.
5. Se a pessoa pedir desconto, condição especial ou promessa de prazo, encaminhe para humano.

## Campos

```json
{
  "intent": "orcamento",
  "lead_stage": "",
  "lead_score": 0,
  "interest": "",
  "budget_signal": "",
  "urgency": "low|medium|high",
  "decision_signal": "",
  "objections": [],
  "next_action": ""
}
```

## Regras

- Não invente preço ou disponibilidade.
- Não pressione o contato; qualificação boa respeita o momento de compra.
- Use `product-interest-extraction` quando houver produtos específicos.
