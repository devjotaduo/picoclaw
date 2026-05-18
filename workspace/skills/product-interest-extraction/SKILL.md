---
name: product-interest-extraction
description: Extrair produtos, serviços, quantidades, preço perguntado, objeções e intenção de compra em conversas de WhatsApp. Ativar quando a pessoa citar item, orçamento, disponibilidade, frete, entrega, medida, marca ou comparação de preço.
version: 1.0.0
language: pt-br
---

# Product Interest Extraction

## Workflow

1. Liste cada produto/serviço citado com nome normalizado.
2. Extraia quantidade, medida, variação, marca, preço citado e urgência.
3. Identifique objeções: preço, prazo, frete, disponibilidade, qualidade ou forma de pagamento.
4. Diferencie pergunta de preço de intenção de compra.
5. Atualize o interesse do contato e o resumo comercial.

## Saída Esperada

```json
{
  "products": [
    {
      "product": "",
      "quantity": "",
      "price_text": "",
      "objection": ""
    }
  ],
  "purchase_intent": "low|medium|high"
}
```

## Regras

- Não normalize para um produto do catálogo se a correspondência for incerta.
- Se preço não estiver confirmado, responda como "vou verificar".
- Produto citado em reclamação não é necessariamente oportunidade comercial.
