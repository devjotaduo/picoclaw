---
name: publicar-instagram
description: Publica um post (foto + caption + hashtags) no Instagram da empresa usando as credenciais do `config/social-credentials.md`.
visibility: marketing
---

# Skill: Publicar Instagram

## Objetivo
Levar um post já criado (via `criar-post-instagram`) até o feed do
Instagram da empresa — incluindo upload de imagem, caption, hashtags e
agendamento opcional.

## Quando usar
- Lia ou o dono aprovou um post finalizado em `marketing/posts/`.
- `config/social-credentials.md` tem credenciais válidas do Meta
  Business / Instagram Graph API.
- Não usar pra Stories ou Reels (skills separadas se forem necessárias).

## Processo
1. Carregar o post de `marketing/posts/<slug>.md` (caption + hashtags +
   path da imagem).
2. Validar caption (<= 2200 caracteres) e número de hashtags (<= 30).
3. Upload da imagem via `IG_CONTAINER` na Graph API.
4. Publicar o container retornado.
5. Registrar em `memory/posts-publicados.md`: data, slug, link,
   métricas iniciais (likes/comments após 1h).
6. Notificar o dono via Rafael com o link do post.

## Dados de entrada
- `post_slug` (referência ao arquivo em `marketing/posts/`).
- `agendar_para` (opcional, ISO datetime).

## Dados de saída
- `post_id`, `link`, `publicado_em`.

## Erros
- Token Meta expirado → escalar pro dono renovar via `config/social-credentials.md`.
- Imagem fora de spec (proporção/peso) → reabrir `gerar-imagem-post`.
- Rate limit Graph API → enfileirar e tentar em 1h.
