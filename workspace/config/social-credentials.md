# Credenciais de redes sociais

Tokens e IDs pras skills `marketing/publicar-instagram`,
`marketing/criar-post-instagram`, `marketing/publicar-site-simples`,
etc. **NUNCA** colar token em plaintext — use `file://` ou `enc://`
(ver `pkg/credential/credential.go`).

## Instagram / Meta Business [ATUALIZAR ou remover]
- Instagram Business Account ID: [ATUALIZAR]
- Page ID (Facebook vinculado): [ATUALIZAR]
- App ID: [ATUALIZAR]
- Long-lived access token: `file://meta.long_lived_token`
- Renovação: tokens expiram em ~60 dias. Rafael deve alertar 7 dias
  antes via heartbeat.

## Facebook Página [ATUALIZAR ou remover]
- Page ID: [ATUALIZAR — mesmo do Instagram vinculado]
- Token: mesma `file://meta.long_lived_token` do bloco acima.

## TikTok Business [ATUALIZAR ou remover]
- Advertiser ID: [ATUALIZAR]
- Access token: `file://tiktok.access_token`

## LinkedIn Company Page [ATUALIZAR ou remover]
- Organization URN: [ATUALIZAR]
- Access token: `file://linkedin.access_token`

## Site próprio / Blog [ATUALIZAR ou remover]
- CMS: [ATUALIZAR — WordPress / Ghost / Hugo / etc]
- API endpoint: [ATUALIZAR]
- API key: `file://site.api_key`

## Limites operacionais

- Lia (marketing) só publica após aprovação explícita do dono na
  primeira semana de uso. Depois pode publicar autônoma respeitando
  o `calendario-datas.md`.
- Posts orgânicos: até 1/dia por rede social.
- Anúncios pagos: SEMPRE exigem aprovação humana, independente do
  valor.

## Auditoria

Toda publicação registrada em `memory/posts-publicados.md` com data,
slug, link, alcance/likes após 1h (`publicar-instagram` faz esse
registro automaticamente).
