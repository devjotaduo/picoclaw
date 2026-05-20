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
- HTTPS obrigatório (configurado em `config/hosting.md`).

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
4. Gerar `workspace/output/sites/<slug>/index.html`.
5. Publicar no servidor configurado em `config/hosting.md`.
6. Gerar QR code → `workspace/output/sites/<slug>/qr.png`.
7. Validar: status 200 ✓ | mobile ✓ | carregamento < 2s ✓.

## Saída obrigatória
```
[SITE PUBLICADO]
URL: https://<dominio>/<slug>/
QR Code: workspace/output/sites/<slug>/qr.png
Tamanho: X KB | Mobile: OK | HTTPS: OK
expira_em: YYYY-MM-DD

[PRÓXIMOS PASSOS]
1. Trocar link da bio do Instagram por: https://...
2. Anexar URL no post da campanha.
3. Aprovação humana se houver formulário com dados pessoais.

[STATUS] publicado | rascunho
```

Registrar em `memory/marketing.md`: `id`, `url`, `data_publicacao`, `campanha_associada`, `expira_em`.

## Despublicação automática
- D-3 do `expira_em`: Lia avisa Rafael.
- Após confirmação: mover para `workspace/output/sites/_arquivados/<slug>-YYYYMMDD/`.

## Não pode
- Publicar formulário coletando dados pessoais sem aprovação humana.
- Coletar dado sem consentimento explícito + finalidade declarada (LGPD).
- Usar imagem ou texto sem licença.
- Deixar site ativo além de `expira_em` sem renovação aprovada.
