---
name: fazer-compra
description: Conduz a finalização de uma compra (carrinho → pagamento → confirmação) usando as credenciais do `config/shopping-credentials.md`.
visibility: atendimento
---

# Skill: Fazer Compra

## Objetivo
Finalizar uma compra solicitada pelo cliente quando o catálogo e as
credenciais da loja estão configurados em
`workspace/config/shopping-credentials.md`.

## Quando usar
- Cliente confirmou intenção de compra com Marcos.
- Produto + quantidade + endereço de entrega já estão na sessão.
- `config/shopping-credentials.md` aponta para um marketplace integrado.

## Processo
1. Validar produto, variação, quantidade e endereço com o cliente.
2. Consultar `pesquisar-preco` se houver dúvida de valor.
3. Adicionar ao carrinho via API/agent-browser conforme o marketplace.
4. Confirmar valor final + frete com o cliente ANTES de pagar.
5. Executar pagamento via método pré-autorizado em
   `shopping-credentials.md`.
6. Enviar comprovante + número de pedido no chat.
7. Atualizar memória do cliente com a compra realizada.

## Dados de entrada
- `produto_id`, `variacao`, `quantidade`, `endereco`, `forma_pagamento`.

## Dados de saída
- `pedido_id`, `valor_final`, `prazo_entrega`, `link_acompanhamento`.

## Erros comuns
- Estoque indisponível → propor variação semelhante ou aguardar.
- Cartão recusado → escalar pra atendimento humano.
- Marketplace fora do ar → reagendar, registrar tentativa na memória.
