# Credenciais de compra

Marketplaces autorizados pras skills `compras/fazer-compra` e
`compras/pesquisar-preco`. **NUNCA** colar token em plaintext aqui —
use `file://<path-no-secrets>` ou `enc://<base64>` que o picoclaw
resolve em tempo de execução (ver `pkg/credential/credential.go`).

## Mercado Livre [ATUALIZAR ou remover]
- App ID: [ATUALIZAR]
- Client secret: `file://mercadolivre.client_secret`
- Refresh token: `file://mercadolivre.refresh_token`
- Loja vinculada: [ATUALIZAR — nome da loja oficial]
- Forma de pagamento default: PIX

## Magazine Luiza [ATUALIZAR ou remover]
- Partner ID: [ATUALIZAR]
- API key: `file://magalu.api_key`
- Forma de pagamento default: cartão pré-cadastrado

## Amazon Seller [ATUALIZAR ou remover]
- Seller ID: [ATUALIZAR]
- MWS auth token: `file://amazon.mws_token`
- Forma de pagamento default: cartão pré-cadastrado

## Loja própria (Shopify, Nuvemshop, etc) [ATUALIZAR ou remover]
- URL: [ATUALIZAR]
- API key: `file://loja.api_key`
- Gateway de pagamento: [ATUALIZAR — Stripe / Pagar.me / etc]

## Limites operacionais

- Valor máximo por compra automatizada: R$ 500,00 [ATUALIZAR]
- Acima do limite, exigir confirmação humana via `request_handoff`.
- Horário permitido pra compras: 08h–22h (fuso da empresa) [ATUALIZAR]
- Forma de pagamento default em caso de dúvida: PIX [ATUALIZAR]

## Auditoria

Toda compra realizada deve aparecer em `memory/compras-realizadas.md`
com data, marketplace, valor, cliente, número do pedido. Use a skill
`fazer-compra` que já faz esse registro automaticamente.
