# Briefing Técnico — Canal Instagram (Publicação via API)

**Criado por:** Lia (marketing)
**Solicitado por:** dono — sessão de teste 2026-05-22
**Status:** proposta — aguardando priorização pelo time técnico

---

## Contexto

O Picoclaw não possui canal Instagram (`pkg/channels/instagram/`). A publicação de posts
aprovados pela Lia é feita manualmente pelo dono ou responsável de marketing.

Este briefing descreve o que seria necessário para implementar publicação automatizada
via **Meta Graph API for Instagram**.

---

## Pré-requisitos do lado Meta (responsabilidade do tenant)

| Requisito | Detalhe |
|---|---|
| Conta Instagram | Tipo Business ou Creator — conta pessoal não suporta Graph API |
| Página do Facebook | A conta Instagram precisa estar vinculada a uma Página do Facebook |
| App Meta | Criar em developers.facebook.com, passar por App Review |
| Permissões do App | `instagram_content_publish`, `instagram_basic`, `pages_read_engagement` |
| Token de longa duração | 60 dias, renovação automática necessária |

---

## O que o time técnico precisa implementar no Picoclaw

### 1. Canal `pkg/channels/instagram/`

Implementar `channels.Channel` com:

```
pkg/channels/instagram/
├── channel.go          # implements channels.Channel interface
├── publisher.go        # wraps Meta Graph API calls
├── oauth.go            # Meta OAuth2 flow (token exchange + refresh)
├── media.go            # image upload to Instagram media container
└── config.go           # channel-specific config struct
```

### 2. Autenticação OAuth2 — Meta

- Fluxo: `GET /oauth/authorize` → Meta → callback → exchange code → long-lived token
- Token: armazenar em `$PICOCLAW_HOME/channels/instagram/token.json`
- Renovação: antes de expirar (token tem 60 dias, renovar em D-7)
- Escopos necessários: `instagram_content_publish instagram_basic pages_read_engagement`

### 3. Publicação de post de feed (imagem única)

```
# Passo 1: criar container de mídia
POST https://graph.facebook.com/v19.0/{ig-user-id}/media
  ?image_url={url_publica_da_imagem}
  &caption={legenda}
  &access_token={token}

# Passo 2: publicar
POST https://graph.facebook.com/v19.0/{ig-user-id}/media_publish
  ?creation_id={id_do_container}
  &access_token={token}
```

**Importante:** a imagem deve ser acessível publicamente por URL. O launcher já serve
`/public/marketing/{asset}` — com `PICOCLAW_PUBLIC_BASE_URL` configurado, a URL absoluta
fica disponível via `GET /api/marketing/public-base-url`.

### 4. Publicação de carrossel (múltiplas imagens)

```
# Passo 1: criar container para cada imagem
POST .../media?image_url={url}&is_carousel_item=true&access_token={token}
  → retorna {child_id} para cada imagem

# Passo 2: criar container do carrossel
POST .../media?media_type=CAROUSEL&children={child_id1},{child_id2,...}&caption={legenda}

# Passo 3: publicar
POST .../media_publish?creation_id={carousel_id}
```

### 5. Agendamento de publicação

```
POST .../media
  ?image_url={url}
  &caption={legenda}
  &published=false
  &scheduled_publish_time={unix_timestamp}
```

Requer que o app tenha o escopo `instagram_content_publish` aprovado para scheduling.

### 6. Callback de confirmação

Após publicar com sucesso, o canal deve:
1. Chamar `PUT /api/workspace/memory/marketing.md` atualizando o status do registro de `aprovado` para `publicado`
2. Registrar `ig_post_id` e `permalink` no registro de campanha em `memory/marketing.md`
3. Emitir evento `marketing.published` no barramento interno (para relatórios)

---

## Limitações conhecidas da Meta Graph API

| Funcionalidade | Suporte via API | Observação |
|---|---|---|
| Feed (imagem única) | Sim | Principal caso de uso |
| Carrossel (multi-imagem) | Sim | Máx 10 imagens |
| Reels (vídeo curto) | Sim | Conta precisa ter >1.000 seguidores |
| Stories | **Não** | API não disponível para apps de terceiros (só via parceiro Meta Business certificado) |
| Agendamento | Sim | Requer escopo adicional no App Review |
| DM / mensagens | Não | Não é o escopo deste canal |

---

## Stories — caminho alternativo

Como a Meta não libera Stories para apps de terceiros, duas opções:

1. **Continuação manual**: Lia entrega os 3 frames do story gerados localmente; o dono publica pelo app.
2. **Creator Studio / Meta Business Suite**: permite agendamento de stories via interface web — não é API, mas reduz fricção.

A opção 1 já funciona hoje. A opção 2 é manual mas não exige código.

---

## Limites de uso da API

| Limite | Valor |
|---|---|
| Posts por dia por conta | 25 |
| Requests por hora por token | 200 |
| Imagens por carrossel | 10 |
| Tamanho máximo de imagem | 8 MB |
| Formatos aceitos | JPEG, PNG |

---

## Configuração no `config.json` (após implementação)

```json
{
  "channels": {
    "instagram": {
      "enabled": true,
      "ig_user_id": "123456789",
      "page_id": "987654321",
      "app_id": "xxx",
      "app_secret": "file://instagram-app-secret.key",
      "access_token": "file://instagram-token.key",
      "auto_publish": false,
      "require_approval": true
    }
  }
}
```

**`require_approval: true`** (padrão e recomendado): Lia gera o conteúdo, humano aprova,
sistema publica. Nunca publicação 100% autônoma sem aprovação registrada.

---

## Prioridade sugerida

| Item | Esforço | Valor |
|---|---|---|
| Feed de imagem única | Médio (1-2 dias) | Alto — principal formato |
| Carrossel | Médio (meio dia adicional) | Médio |
| Agendamento | Baixo (flag na API) | Alto para campanhas sazonais |
| Stories via app | Não implementável via API | Manter manual |
| Reels | Alto (upload de vídeo, transcodificação) | Baixo no curto prazo |

**Recomendação**: implementar feed + carrossel + agendamento como MVP do canal Instagram.
