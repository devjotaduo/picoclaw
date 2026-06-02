---
name: gerar-imagem-post
description: Gera imagens reais para post de Instagram (feed 1080x1080, story 1080x1920, carrossel 1080x1350, OG 1200x630) usando o tool nativo generate_image. Puxa identidade visual de memory/marca.md, monta o prompt via design-instagram §5, salva em public/marketing e retorna o link público. Tem fallback para card CSS quando a geração não está disponível.
visibility: global
---

# Gerar imagem de post

## Quando usar
- Lia precisa criar arte para post, campanha, data comemorativa, lançamento ou anúncio.
- Dono ou Rafael pediu "cria uma arte para...".

## Como a geração funciona de verdade (leia antes)

A imagem é gerada pelo **tool nativo `generate_image`** (não por shell, não por
stub). Fatos do runtime que você PRECISA respeitar:

- O tool só está disponível para o agente **marketing** (Lia) e **assistente**.
- Parâmetros aceitos: `prompt` (obrigatório), `size` (ex.: `"1080x1080"`),
  `name` (radical do arquivo).
- O `size` é convertido em **aspect ratio** pelo provider — então use os
  tamanhos reais de cada formato (tabela abaixo), não `1024x1024`.
- O arquivo é salvo em **`workspace/public/marketing/<name><ext>`** (o
  `output_dir` do tool já aponta pra pasta pública). ⚠️ **A extensão NÃO é
  sempre `.png`**: o tool escolhe `<ext>` pelo Content-Type do provider — pode
  vir `.jpg` ou `.webp`. Nunca assuma `.png`.
- **O `name` é achatado**: barras `/` e acentos são removidos. NÃO tente criar
  subpasta `YYYY-MM-DD/` pelo `name` — coloque a data no próprio radical:
  `post-<slug>-<formato>-<YYYYMMDD>`.
- O tool retorna a tag `[file:.../workspace/public/marketing/<filename>]` com o
  **filename real** (já com a extensão certa). Extraia o basename dessa tag e
  use-o exato para montar o link público (passo abaixo) — não remonte o nome
  na mão.

### Pré-condições — checar ANTES de chamar o tool

1. O tool `generate_image` está habilitado? (config `tools.image_generation.enabled=true`).
   Se você chamar e vier `image generation api_key is not configured` ou o tool
   não existir, **vá para o fallback** (Seção "Fallback") — não invente um PNG.
2. `memory/marca.md` tem cores e tipografia? Se estiver vazio, **pare e
   pergunte ao dono** — não gere arte genérica.

## Antes de montar o prompt
1. Consultar `marketing/design-instagram` — Seção 5 (template de prompt do tipo
   de post) e Seção 6 (safe zones).
2. Consultar `memory/marca.md` → paleta (hex), tipografia, estilo, elementos
   obrigatórios/proibidos.
3. Consultar `memory/empresa.md` → nome, segmento, posicionamento.

## Formatos suportados (passe estes valores em `size`)
| Formato | `size` | Aspect |
|---|---|---|
| Feed | `1080x1080` | 1:1 |
| Story / Reel cover | `1080x1920` | 9:16 |
| Carrossel (slide) | `1080x1350` | 4:5 |
| OG / Link preview | `1200x630` | ~1.91:1 |

## Processo
1. Montar o prompt visual com o template de `design-instagram §5.1`: assunto +
   estilo + paleta (hex de marca.md) + composição + texto na imagem (dentro das
   safe zones, < 20% da área) + elementos obrigatórios (logo, CTA) + elementos
   proibidos (rosto real sem autorização, concorrente, claim não validado).
2. Chamar `generate_image` com:
   - `prompt`: o prompt montado.
   - `size`: o valor da tabela acima para o formato.
   - `name`: `post-<slug>-<formato>-<YYYYMMDD>` (sem barra, sem acento).
3. Ler o path retornado na tag `[file:...]` e extrair o **basename real**
   (`<filename>`, já com a extensão que o provider devolveu).
4. Montar o link público: `GET /api/marketing/public-base-url` →
   `<base_url>/public/marketing/<filename>` usando o basename do passo 3 — nunca
   `.png` fixo (absoluto em prod, relativo em dev).
5. **Verificar** (ver Seção "Verificação").
6. Registrar em `memory/marketing.md`: data, campanha, formato, `name`, prompt
   usado, status=rascunho.

## Verificação (obrigatória — não pule)
Depois que o tool retornar:
- Confirme que o arquivo existe no path retornado (o tool falhou silenciosamente
  se não houver tag `[file:...]`).
- Confirme que o `name` que você pediu bate com o arquivo salvo (lembre que é
  achatado — se sumiu acento/barra, o link público tem que usar o nome real).
- Se o provider devolveu erro (`image provider returned 4xx/5xx`), **não
  registre como rascunho** — reporte a falha ao Rafael e ofereça o fallback.

## Fallback — quando a geração real não está disponível
Se `generate_image` não existe, está desabilitado, ou retornou erro de
credencial/provider:

1. **Não invente um PNG** e não crie `.stub.txt` como entrega final.
2. Gere um **card CSS** no lugar: um HTML 1:1 autocontido em
   `public/marketing/<slug>-card/index.html` que renderiza a arte com os tokens
   da marca (mesma paleta/fonte do `design-visual`). Serve como preview real e
   aprovável enquanto a imagem não sai.
3. Deixe explícito na entrega: "arte como card CSS — imagem final pendente de
   `generate_image` (config `tools.image_generation.enabled`)".
4. Registre `status: rascunho — imagem pendente` em `memory/marketing.md`.

## Saída obrigatória
```
[IMAGEM GERADA]
Arquivo: workspace/public/marketing/<filename>   (basename real da tag [file:...]; ou .../<slug>-card/index.html no fallback)
Link público: <base_url>/public/marketing/<filename>
(filename = basename retornado pelo tool, com a extensão real .png/.jpg/.webp; base_url de GET /api/marketing/public-base-url; relativo se env não setado)
Modelo: generate_image (config tools.image_generation.model) | fallback: card CSS
[STATUS] rascunho — aguardando aprovação humana
[PRÓXIMO PASSO] Lia gera legenda via criar-post-instagram
```

## Não pode
- Publicar no Instagram sem aprovação.
- Usar rosto de pessoa real sem autorização registrada em `memory/marca.md`.
- Usar marca de terceiros.
- Gerar conteúdo político, religioso ou sensível.
- Entregar `.stub.txt` como se fosse a arte final (era o bug do teste de 2026-05-22).
- Hardcodar nome de modelo no prompt — o modelo vem da config do tool.
