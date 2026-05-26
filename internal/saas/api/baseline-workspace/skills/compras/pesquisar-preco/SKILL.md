---
name: pesquisar-preco
description: Consulta preço, disponibilidade e variações de um produto em marketplaces autorizados (Mercado Livre, Magalu, Amazon, lojas próprias).
visibility: atendimento
---

# Skill: Pesquisar Preço

## Objetivo
Levantar opções de preço + disponibilidade pra um produto antes de
recomendar compra, comparando entre marketplaces autorizados.

## Quando usar
- Cliente perguntou "quanto custa", "tem em estoque", "qual o melhor
  preço".
- Antes de chamar `fazer-compra` quando há mais de um marketplace
  configurado.

## Processo
1. Identificar o produto com o cliente (nome, marca, modelo, variação).
2. Consultar cada marketplace listado em `config/shopping-credentials.md`
   via API ou agent-browser.
3. Coletar para cada hit: preço atual, preço PIX, frete, prazo, link
   direto.
4. Retornar pro cliente a opção mais vantajosa + 1 alternativa, NUNCA
   uma lista crua de 10.
5. Registrar a consulta na memória do cliente (interesse no produto).

## Dados de entrada
- `produto_query` (texto livre), `cep_entrega`, `prioridade` (preço /
  prazo / qualidade).

## Dados de saída
- Lista ordenada por valor total (preço + frete) com até 3 opções, cada
  uma com `marketplace`, `valor_total`, `prazo_entrega`, `link`.

## Limites
- Não recomenda lojas fora de `shopping-credentials.md`.
- Não usa cupons sem confirmação prévia do cliente.
