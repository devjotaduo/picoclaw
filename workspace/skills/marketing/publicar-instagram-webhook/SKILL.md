---
name: publicar-instagram-webhook
description: Publica post no Instagram via webhook Make.com (gratuito, ate 1000 ops/mes). Lia envia imagem + legenda + hashtags para uma URL de webhook configurada pelo Rafael; o Make.com publica via conector oficial do Instagram Business. Nao requer Meta App proprio nem burocracia de aprovacao de API.
visibility: internal
depends_on:
  - marketing/criar-post-instagram
  - marketing/gerar-imagem-post
  - consultar-memoria
  - atualizar-memoria
requires_approval: true
requires_human_confirmation: true
env_required:
  - MAKE_INSTAGRAM_WEBHOOK_URL
---

# Skill: publicar-instagram-webhook

> **Provedor de `marketing/publicar-instagram`.** Não invocar direto — Lia
> sempre entra por `publicar-instagram`, que roteia pra cá quando o webhook
> Make.com é o canal configurado. As regras universais (aprovação, sem claim,
> registro pós-publicação) vêm de lá.

Publica conteudo no Instagram usando **Make.com como intermediario** (webhook + conector oficial Instagram Business). Gratuito ate 1.000 operacoes/mes.

> ATENCAO: So chamar esta skill apos aprovacao humana registrada.
> A imagem deve estar em URL HTTPS acessivel publicamente.

---

## Por que Make.com e nao a API direta da Meta

| Criterio | Meta Graph API direta | Make.com webhook |
|---|---|---|
| Custo | Gratis (mas burocracia) | Gratis ate 1.000 ops/mes |
| Aprovacao | 2-7 dias, formulario, revisao | Zero — Rafael configura em ~1h |
| Meta App proprio | Obrigatorio | Nao precisa (Make usa o proprio) |
| Manutencao de token | Rotacao a cada 60 dias | Make renova automaticamente |
| Tipos suportados | Feed, carrossel, reel | Feed, carrossel, reel |
| Limite de publicacoes | 25 posts/24h | 25 posts/24h (limite da Meta) |

---

## 1. Pre-requisitos

### 1.1 Do lado do Rafael (uma vez so)

1. Conta no Make.com — plano Free (gratis)
2. Instagram Business Account ou Creator Account conectada a uma Pagina do Facebook
3. Cenario Make configurado (ver `workspace/docs/make-instagram-setup.md`)
4. Webhook URL gerada pelo Make salva em `$MAKE_INSTAGRAM_WEBHOOK_URL`

### 1.2 Do lado da Lia (a cada publicacao)

- Post criado via `criar-post-instagram` (legenda + hashtags aprovadas)
- Imagem gerada via `gerar-imagem-post` (link publico HTTPS disponivel)
- Aprovacao humana registrada em `memory/marketing.md`

---

## 2. Payload do webhook

Lia envia um POST com este JSON para `$MAKE_INSTAGRAM_WEBHOOK_URL`:

```json
{
  "image_url": "https://tenant.picoclaw.app/public/marketing/YYYY-MM-DD/post-slug-feed.png",
  "caption": "Legenda completa com quebras de linha...\n\n#tag1 #tag2 #tag3",
  "first_comment": "CTA adicional ou link — postado como primeiro comentario",
  "media_type": "IMAGE",
  "campaign_id": "cmp-2026-06-12-namorados",
  "approved_by": "Rafael",
  "approved_at": "2026-06-10T14:30:00-03:00"
}
```

### Campos obrigatorios

| Campo | Tipo | Descricao |
|---|---|---|
| `image_url` | string | URL HTTPS da imagem. Deve ser acessivel sem autenticacao. |
| `caption` | string | Legenda completa (max 2.200 chars). Hashtags incluidas. |
| `media_type` | string | `IMAGE` ou `CAROUSEL` |
| `campaign_id` | string | ID da campanha em `memory/marketing.md` |
| `approved_by` | string | Nome de quem aprovou |
| `approved_at` | ISO 8601 | Timestamp da aprovacao |

### Campos opcionais

| Campo | Tipo | Descricao |
|---|---|---|
| `first_comment` | string | Postar automaticamente apos publicar (CTA, link) |
| `schedule_at` | ISO 8601 | Agendar publicacao (Make Pro; no free = imediato) |

---

## 3. Fluxo completo

```
Lia gera post (criar-post-instagram)
    |
    v
Lia gera imagem (gerar-imagem-post) → URL publica HTTPS
    |
    v
Lia apresenta para aprovacao humana
    |
    v
Rafael aprova → "ok, publica"
    |
    v
Lia chama publicar-instagram-webhook:
  POST $MAKE_INSTAGRAM_WEBHOOK_URL { image_url, caption, ... }
    |
    v
Make.com recebe → publica via conector Instagram Business
    |
    v
Make retorna { status: "published", post_id: "...", permalink: "..." }
    |
    v
Lia registra em memory/marketing.md: status=publicado, permalink, data
    |
    v
Lia informa Rafael: "Publicado. Link: <permalink>"
```

---

## 4. Como Lia chama o webhook

```bash
# Verificar se webhook esta configurado
if [ -z "$MAKE_INSTAGRAM_WEBHOOK_URL" ]; then
  echo "ERRO: MAKE_INSTAGRAM_WEBHOOK_URL nao configurado."
  echo "Rafael precisa seguir workspace/docs/make-instagram-setup.md"
  exit 1
fi

RESPONSE=$(curl -s -X POST "$MAKE_INSTAGRAM_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"image_url\": \"$IMAGE_URL\",
    \"caption\": \"$CAPTION\",
    \"first_comment\": \"$FIRST_COMMENT\",
    \"media_type\": \"IMAGE\",
    \"campaign_id\": \"$CAMPAIGN_ID\",
    \"approved_by\": \"$APPROVED_BY\",
    \"approved_at\": \"$(date -u +%Y-%m-%dT%H:%M:%S-03:00)\"
  }")

echo "$RESPONSE"
```

---

## 5. Respostas esperadas do Make

### Sucesso

```json
{
  "status": "published",
  "post_id": "17854360229135492",
  "permalink": "https://www.instagram.com/p/ABC123xyz/",
  "timestamp": "2026-06-12T10:00:00+0000"
}
```

### Erro — imagem inacessivel

```json
{
  "status": "error",
  "code": "IMAGE_NOT_ACCESSIBLE",
  "message": "Make nao conseguiu baixar a imagem. Verificar se URL e publica e HTTPS."
}
```

### Erro — rate limit

```json
{
  "status": "error",
  "code": "RATE_LIMIT",
  "message": "Limite de 25 posts/24h atingido. Tente amanha."
}
```

---

## 6. O que Lia registra apos publicar

Atualizar `memory/marketing.md` com:

```markdown
## Campanha: <slug>
- Status: publicado
- Data: YYYY-MM-DD HH:MM
- Link: https://www.instagram.com/p/ABC123xyz/
- Post ID: 17854360229135492
- Aprovado por: Rafael
- Imagem: workspace/public/marketing/YYYY-MM-DD/post-slug-feed.png
```

---

## 7. Limites e custos

| Limite | Valor |
|---|---|
| Make.com Free | 1.000 operacoes/mes |
| Posts por operacao | 1 operacao = 1 post |
| Rate limit Instagram | 25 posts por conta por 24h |
| Imagem maxima | 8 MB |
| Caption maxima | 2.200 caracteres |
| Hashtags maximas | 30 (recomendado: 10-15) |

Quando ultrapassar 1.000 ops/mes, Make.com cobra ~$9/mes (Core) com 10.000 ops.

---

## 8. O que esta skill NAO faz

- Nao publica Stories (Meta API nao permite automacao de stories)
- Nao faz login com usuario/senha via browser (viola ToS da Meta)
- Nao armazena token de acesso da Meta (Make gerencia internamente)
- Nao garante alcance, impressoes ou engajamento
- Nao publica sem aprovacao humana registrada

---

## 9. Checklist pre-publicacao

Lia verifica antes de chamar o webhook:

- [ ] Imagem aprovada por Rafael ou dono
- [ ] Legenda revisada (sem preco inventado, sem claim medico, sem concorrente)
- [ ] Hashtags dentro do segmento e sem spam
- [ ] URL da imagem e HTTPS e acessivel sem login
- [ ] `$MAKE_INSTAGRAM_WEBHOOK_URL` configurado
- [ ] Campanha registrada em `memory/marketing.md` com status=aprovado
- [ ] Menos de 25 posts nas ultimas 24h (verificar memory/marketing.md)
