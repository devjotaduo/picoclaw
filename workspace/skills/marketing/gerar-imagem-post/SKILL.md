---
name: gerar-imagem-post
description: Gera imagens prontas para post de Instagram (feed 1080x1080, story 1080x1920, reel cover 1080x1920) a partir de um briefing curto. Puxa identidade visual de memory/marketing.md antes de gerar. Retorna caminho do arquivo gerado e link público se site estiver publicado.
visibility: global
---

# Gerar imagem de post

## Quando usar
- Lia precisa criar arte para post, campanha, data comemorativa, lançamento ou anúncio.
- Dono ou Rafael pediu "cria uma arte para...".

## Antes de gerar
1. Consultar `memory/marketing.md` → paleta, tipografia, estilo, exemplos aprovados.
2. Consultar `memory/empresa.md` → nome, segmento, posicionamento.
3. Se faltar identidade visual, **perguntar ao dono** antes de gerar. Não inventar.

## Formatos suportados
| Formato | Resolução |
|---|---|
| Feed | 1080 × 1080 |
| Story / Reel cover | 1080 × 1920 |
| Carrossel (slide) | 1080 × 1350 |
| OG / Link preview | 1200 × 630 |

## Processo
1. Montar prompt visual com: assunto + estilo + paleta + elementos obrigatórios (logo, CTA, data) + elementos proibidos (concorrente, pessoas reais sem autorização, claims não validados).
2. Gerar a imagem usando a ferramenta de geração disponível.
3. Salvar em `workspace/public/marketing/YYYY-MM-DD/post-<slug>-<formato>.png`.
4. Registrar em `memory/marketing.md`: data, campanha, formato, prompt, status=rascunho.

## Saída obrigatória
```
[IMAGEM GERADA]
Arquivo: workspace/public/marketing/YYYY-MM-DD/post-<slug>-<formato>.png
Link público: <base_url>/public/marketing/YYYY-MM-DD/post-<slug>-<formato>.png
(base_url de GET /api/marketing/public-base-url; relativo se env não setado)
[STATUS] rascunho — aguardando aprovação humana
[PRÓXIMO PASSO] Lia gera legenda via criar-post-instagram
```

## Não pode
- Publicar no Instagram sem aprovação.
- Usar rosto de pessoa real sem autorização registrada.
- Usar marca de terceiros.
- Gerar conteúdo político, religioso ou sensível.
