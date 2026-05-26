---
name: publicar-site-simples
description: Cria mini-sites em HTML estático (landing page, catálogo, link-in-bio, página de campanha) e publica em servidor público. Retorna link direto e curto pronto para bio do Instagram, WhatsApp e QR code.
visibility: global
---

# Publicar site simples

## Quando usar
- Campanha precisa de landing page com link único.
- Dono pediu "faz um site da promoção".
- Precisa de link-in-bio mensal atualizado.
- Aniversário, lançamento, promoção com catálogo ou formulário de interesse.

## Tecnologia
- HTML5 + CSS embutido no `<style>` — nada externo.
- Mobile-first (80%+ tráfego Instagram é mobile).
- Fonte mínima 16px, contraste WCAG AA.
- Sem rastreamento de terceiros.
- HTTPS obrigatório em produção (configurado via `PICOCLAW_PUBLIC_BASE_URL`).
- **Design**: antes de gerar HTML, consultar `marketing/design-visual` para paleta, fonte e layout correto para o segmento da empresa. Nunca usar gradiente roxo genérico, Arial ou Roboto.

## Onde salvar os arquivos

Salvar **sempre** dentro da pasta pública do próprio workspace:

```
workspace/public/marketing/<slug>.html
workspace/public/marketing/<slug>/index.html   (quando há múltiplos assets)
workspace/public/marketing/<slug>.png          (imagens standalone)
```

O launcher serve essa pasta em `/public/marketing/{asset}` com segurança (path traversal bloqueado, extensões permitidas: .html .htm .css .js .json .png .jpg .jpeg .webp .gif .svg .pdf).

## URL pública

O link público é montado pelo backend automaticamente. Consulte `GET /api/marketing/public-base-url` antes de gerar a entrega:

- Se `PICOCLAW_PUBLIC_BASE_URL` estiver setado (SaaS/produção), a resposta terá `base_url=https://<tenant>.jotaduo.com` e os links serão **absolutos**: `https://<tenant>.jotaduo.com/public/marketing/<slug>.html`
- Se não estiver setado (standalone/dev), os links serão **relativos**: `/public/marketing/<slug>.html`

Nunca hardcode host ou porta. Use sempre o `base_url` retornado por `/api/marketing/public-base-url`.

## Seções obrigatórias
1. **Hero** — imagem OG (1200×630) + título + subtítulo + botão CTA.
2. **Benefícios** — 3 a 5 itens em ícone + texto curto.
3. **Prova social** — depoimento, número ou logo (somente se autorizado).
4. **CTA principal** — WhatsApp click-to-chat (`https://wa.me/55...`) ou link de compra.
5. **Rodapé** — nome, CNPJ, endereço, link política de privacidade, contato.

## Processo
1. Consultar `memory/empresa.md` + `memory/marketing.md` (identidade visual).
2. Receber briefing: objetivo, CTA, texto, imagens.
3. Gerar imagens necessárias com `gerar-imagem-post` (formato OG 1200×630).
4. Gerar `workspace/public/marketing/<slug>/index.html`.
5. Consultar `GET /api/marketing/public-base-url` para montar o link correto.
6. Gerar QR code → `workspace/public/marketing/<slug>/qr.png`.
7. Validar: status 200 ✓ | mobile ✓ | carregamento < 2s ✓.

## Saída obrigatória
```
[SITE PUBLICADO]
URL: <base_url>/public/marketing/<slug>/
QR Code: workspace/public/marketing/<slug>/qr.png
Tamanho: X KB | Mobile: OK | HTTPS: OK
expira_em: YYYY-MM-DD

[PRÓXIMOS PASSOS]
1. Trocar link da bio do Instagram por: <url>
2. Anexar URL no post da campanha.
3. Aprovação humana se houver formulário com dados pessoais.

[STATUS] publicado | rascunho
```

Registrar em `memory/marketing.md`: `id`, `url`, `data_publicacao`, `campanha_associada`, `expira_em`.

## Despublicação automática
- D-3 do `expira_em`: Lia avisa Rafael.
- Após confirmação: mover para `workspace/public/marketing/_arquivados/<slug>-YYYYMMDD/`.

## Não pode
- Publicar formulário coletando dados pessoais sem aprovação humana.
- Coletar dado sem consentimento explícito + finalidade declarada (LGPD).
- Usar imagem ou texto sem licença.
- Deixar site ativo além de `expira_em` sem renovação aprovada.
