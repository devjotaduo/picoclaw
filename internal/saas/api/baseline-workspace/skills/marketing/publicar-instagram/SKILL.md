---
name: publicar-instagram
description: Publica post no Instagram de forma legitima via Instagram Graph API (Meta). Requer conta Business ou Creator, Meta App aprovado e access token com escopo instagram_content_publish. Suporta imagem, carrossel e reel cover. Nunca usa automacao de browser (violacao de ToS).
visibility: internal
depends_on:
  - marketing/criar-post-instagram
  - marketing/gerar-imagem-post
  - consultar-memoria
  - atualizar-memoria
used_by:
  - lia
requires_approval: true
requires_human_confirmation: true
---

# Skill: publicar-instagram

**Ponto único de publicação no Instagram.** Esta é a ÚNICA skill que Lia chama
para publicar — ela roteia para o provedor configurado no workspace. As skills
`publicar-instagram-publora`, `publicar-instagram-buffer` e
`publicar-instagram-webhook` são **referências de provedor**, chamadas por aqui;
não invocar nenhuma delas diretamente.

> ATENCAO: Esta skill so pode ser chamada APOS aprovacao humana registrada.
> Nunca usar agent-browser, Selenium, Puppeteer ou qualquer automacao de browser para publicar no Instagram — viola os Termos de Uso da Meta e pode resultar em bloqueio permanente da conta.

## 0. Roteamento — escolha do provedor

Antes de qualquer coisa, descobrir **qual canal está configurado** e despachar.
Ordem de preferência (usar o primeiro disponível):

| Prioridade | Provedor | Como detectar se está disponível | Referência |
|---|---|---|---|
| 1 | **Instagram Graph API** (oficial Meta) | `$META_ACCESS_TOKEN` + `$INSTAGRAM_USER_ID` setados | Seções 1–12 deste arquivo |
| 2 | **Publora** (MCP) | MCP `publora-instagram` conectado no workspace | `marketing/publicar-instagram-publora` |
| 3 | **Buffer** | credencial Buffer configurada | `marketing/publicar-instagram-buffer` |
| 4 | **Webhook Make.com** | `$MAKE_INSTAGRAM_WEBHOOK_URL` setado | `marketing/publicar-instagram-webhook` |

Processo de dispatch:

1. Verificar aprovação humana registrada em `memory/marketing.md` (sem isso, parar).
2. Detectar o provedor pela tabela acima (primeiro que casar).
3. Se **nenhum** estiver configurado: **não publicar**. Marcar a publicação como
   pendente, salvar tudo pronto (arte + legenda aprovadas) e avisar o Rafael
   qual credencial falta. Nunca cair em automação de browser como "plano B".
4. Seguir a referência do provedor escolhido. As regras universais (aprovação,
   sem claim não validado, sem dado pessoal, rate limit, registro pós-publicação
   em `memory/marketing.md`) valem para TODOS os provedores — estão detalhadas
   abaixo para o Graph API e se aplicam igualmente aos outros.

O restante deste arquivo (Seções 1–12) é a referência do **provedor 1 (Graph
API)** — o caminho oficial e recomendado.

---

## 1. Pre-requisitos obrigatorios

Antes de chamar esta skill, os seguintes pre-requisitos devem estar atendidos:

### 1.1 Conta Instagram

| Requisito | Descricao |
|---|---|
| Tipo de conta | Instagram Business Account ou Creator Account (conta pessoal nao suporta a API) |
| Conectada ao Facebook | A conta Instagram deve estar vinculada a uma Pagina do Facebook |
| 2FA configurada | Recomendado — mas nao bloqueia a API |

Para converter conta pessoal em Business: Instagram > Configuracoes > Conta > Mudar para conta profissional.

### 1.2 Meta App

| Requisito | Descricao |
|---|---|
| App criado em | https://developers.facebook.com/apps/ |
| Produto adicionado | "Instagram Graph API" (em "Adicionar Produto") |
| Permissoes solicitadas | `instagram_content_publish`, `instagram_basic`, `pages_read_engagement` |
| Modo do app | Producao (apps em modo desenvolvimento so funcionam para usuarios teste) |
| Revisao de permissoes | `instagram_content_publish` requer revisao da Meta antes de ir para producao |

### 1.3 Access Token

| Requisito | Descricao |
|---|---|
| Tipo | Page Access Token de longa duracao (Long-Lived Page Access Token) |
| Duracao | 60 dias (necessita refresh ou rotacao) |
| Escopo obrigatorio | `instagram_content_publish` |
| Escopo adicional | `instagram_basic`, `pages_show_list`, `pages_read_engagement` |
| Onde armazenar | Variavel de ambiente `META_ACCESS_TOKEN` — NUNCA em arquivo de memoria ou codigo |
| Instagram User ID | Variavel de ambiente `INSTAGRAM_USER_ID` — recuperar via GET /me/accounts |

### 1.4 Imagem para publicacao

| Requisito | Descricao |
|---|---|
| URL publica | A imagem deve estar acessivel via URL publica com HTTPS |
| Fonte | Gerada por gerar-imagem-post e servida via GET /api/marketing/public-base-url |
| Formato | JPEG ou PNG |
| Tamanho maximo | 8 MB |
| Proporcao aceita | 1:1 (feed), 4:5 (retrato), 1.91:1 (paisagem) |
| HTTPS obrigatorio | Instagram Graph API rejeita URLs HTTP |

---

## 2. Fluxo de Autenticacao OAuth 2.0

### 2.1 Fluxo inicial (uma unica vez por conta)

```
1. Gerar URL de autorizacao:
   https://www.facebook.com/dialog/oauth
     ?client_id={app-id}
     &redirect_uri={redirect-uri}
     &scope=instagram_content_publish,instagram_basic,pages_read_engagement
     &response_type=code

2. Usuario autoriza o app (redirect para redirect-uri com ?code=AUTH_CODE)

3. Trocar AUTH_CODE por Short-Lived User Token:
   POST https://graph.facebook.com/v21.0/oauth/access_token
     client_id={app-id}
     client_secret={app-secret}
     redirect_uri={redirect-uri}
     code={AUTH_CODE}
   → retorna: { "access_token": "SHORT_LIVED_TOKEN", "token_type": "bearer" }

4. Converter para Long-Lived User Token (validade: 60 dias):
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   → retorna: { "access_token": "LONG_LIVED_TOKEN", "expires_in": 5183944 }

5. Obter Page Access Token (nunca expira enquanto usuario tem acesso a pagina):
   GET https://graph.facebook.com/v21.0/me/accounts
     ?access_token={LONG_LIVED_TOKEN}
   → retorna lista de paginas; filtrar pela pagina vinculada ao Instagram
   → copiar "access_token" da pagina correta

6. Obter Instagram User ID:
   GET https://graph.facebook.com/v21.0/{page-id}
     ?fields=instagram_business_account
     &access_token={PAGE_TOKEN}
   → retorna: { "instagram_business_account": { "id": "17841405793187218" } }

7. Armazenar:
   META_ACCESS_TOKEN={PAGE_TOKEN}          # variavel de ambiente — nunca em arquivo
   INSTAGRAM_USER_ID=17841405793187218     # variavel de ambiente
```

### 2.2 Refresh do token (a cada 60 dias)

```bash
# Renovar Long-Lived Token antes do vencimento
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={app-id}
  &client_secret={app-secret}
  &fb_exchange_token={CURRENT_LONG_LIVED_TOKEN}
```

> Lia deve alertar o Rafael quando o token estiver a menos de 7 dias do vencimento.
> Verificar vencimento: `GET https://graph.facebook.com/v21.0/debug_token?input_token={token}&access_token={app-id}|{app-secret}`

---

## 3. Endpoints da API

### 3.1 Publicar imagem unica (feed)

**Passo 1: Criar media container**
```
POST https://graph.facebook.com/v21.0/{ig-user-id}/media
Content-Type: application/json

{
  "image_url": "https://<tenant>.jotaduo.com/public/marketing/YYYY-MM-DD/post-slug-feed.png",
  "caption": "<legenda completa com hashtags>",
  "access_token": "{META_ACCESS_TOKEN}"
}

Resposta: { "id": "17889615814769718" }  ← este e o creation_id
```

**Passo 2: Verificar status do container (aguardar STATUS=FINISHED)**
```
GET https://graph.facebook.com/v21.0/{creation_id}
  ?fields=status_code
  &access_token={META_ACCESS_TOKEN}

Resposta esperada: { "status_code": "FINISHED", "id": "17889615814769718" }
Outros status possiveis: IN_PROGRESS, PUBLISHED, ERROR
```

**Passo 3: Publicar**
```
POST https://graph.facebook.com/v21.0/{ig-user-id}/media_publish
Content-Type: application/json

{
  "creation_id": "17889615814769718",
  "access_token": "{META_ACCESS_TOKEN}"
}

Resposta: { "id": "17920238422700849" }  ← este e o media_id publicado
```

---

### 3.2 Publicar carrossel (multiplas imagens)

**Passo 1: Criar container para cada imagem**
```
POST https://graph.facebook.com/v21.0/{ig-user-id}/media
{
  "image_url": "https://...slide-01.png",
  "is_carousel_item": true,
  "access_token": "{META_ACCESS_TOKEN}"
}
→ retorna child_id_1

POST https://graph.facebook.com/v21.0/{ig-user-id}/media
{
  "image_url": "https://...slide-02.png",
  "is_carousel_item": true,
  "access_token": "{META_ACCESS_TOKEN}"
}
→ retorna child_id_2
```

**Passo 2: Criar container pai do carrossel**
```
POST https://graph.facebook.com/v21.0/{ig-user-id}/media
{
  "media_type": "CAROUSEL",
  "children": "{child_id_1},{child_id_2}",
  "caption": "<legenda com hashtags>",
  "access_token": "{META_ACCESS_TOKEN}"
}
→ retorna carousel_container_id
```

**Passo 3: Publicar o carrossel**
```
POST https://graph.facebook.com/v21.0/{ig-user-id}/media_publish
{
  "creation_id": "{carousel_container_id}",
  "access_token": "{META_ACCESS_TOKEN}"
}
```

---

### 3.3 Publicar reel (video)

```
POST https://graph.facebook.com/v21.0/{ig-user-id}/media
{
  "media_type": "REELS",
  "video_url": "https://...reel.mp4",
  "caption": "<legenda>",
  "share_to_feed": true,
  "access_token": "{META_ACCESS_TOKEN}"
}
→ retorna creation_id

# Aguardar STATUS=FINISHED (videos levam mais tempo que imagens)
GET https://graph.facebook.com/v21.0/{creation_id}?fields=status_code&access_token=...

# Publicar
POST https://graph.facebook.com/v21.0/{ig-user-id}/media_publish
{
  "creation_id": "{creation_id}",
  "access_token": "{META_ACCESS_TOKEN}"
}
```

---

### 3.4 Consultar post publicado

```
GET https://graph.facebook.com/v21.0/{media_id}
  ?fields=id,media_type,timestamp,like_count,comments_count,permalink
  &access_token={META_ACCESS_TOKEN}
```

---

## 4. Como Lia deve armazenar e usar o token

### Regras absolutas

- **NUNCA** armazenar o access token em:
  - `memory/marca.md`
  - `memory/marketing.md`
  - `memory/empresa.md`
  - Qualquer arquivo .md do workspace
  - Codigo-fonte ou SKILL.md
  - Mensagem de chat ou log de conversa
- **SEMPRE** ler o token de variavel de ambiente: `$META_ACCESS_TOKEN`
- **SEMPRE** ler o Instagram User ID de: `$INSTAGRAM_USER_ID`
- Se as variaveis nao estiverem setadas, Lia deve parar e alertar o Rafael

### Como verificar se o token esta disponivel (antes de chamar a API)

```bash
if [ -z "$META_ACCESS_TOKEN" ] || [ -z "$INSTAGRAM_USER_ID" ]; then
  echo "ERRO: META_ACCESS_TOKEN ou INSTAGRAM_USER_ID nao configurados."
  echo "Configure as variaveis de ambiente antes de usar esta skill."
  exit 1
fi
```

### Como Lia trata o token em logs e relatorios

- Nunca logar o valor completo do token
- Se precisar referenciar para debug: mostrar apenas os ultimos 6 caracteres (`...XXXXXX`)
- Nunca incluir o token em memory/marketing.md ou em qualquer entrega

---

## 5. Rate Limits

| Limite | Valor | Notas |
|---|---|---|
| Posts por conta | 25 por 24 horas | Inclui imagens, carrosseis e reels |
| Containers criados | 25 por hora | Containers nao publicados contam |
| Requests de API | 200 por hora por token | Compartilhado entre todas as operacoes |
| Tamanho da legenda | 2.200 caracteres | Incluindo hashtags |
| Hashtags por post | 30 maximo | Instagram pode penalizar acima de 30 |
| Imagens por carrossel | 2 a 10 | Minimo 2, maximo 10 |

**Lia deve verificar antes de publicar:**
```
GET https://graph.facebook.com/v21.0/{ig-user-id}/content_publishing_limit
  ?fields=config,quota_usage
  &access_token={META_ACCESS_TOKEN}
```
Se `quota_usage` >= 25: nao publicar, alertar Rafael com horario em que o limite renova.

---

## 6. Tipos de midia suportados

| Tipo | Parametro API | Formatos | Limite de tamanho |
|---|---|---|---|
| Imagem feed | `image_url` | JPEG, PNG | 8 MB |
| Carrossel | `media_type: CAROUSEL` + filhos | JPEG, PNG por slide | 8 MB por slide |
| Reel | `media_type: REELS` + `video_url` | MP4, MOV | 1 GB, max 15 min |
| Story | Nao disponivel na Graph API atual | — | — |

> **Nota sobre Stories:** A Instagram Graph API nao suporta publicacao de Stories via API para a maioria dos apps. A publicacao de Stories so e disponivel para parceiros oficiais da Meta (Media Publishers). Para stories, o caminho ainda e manual via Meta Business Suite.

---

## 7. Checklist de conformidade antes de publicar

Lia deve passar por este checklist ANTES de chamar a API. Qualquer item FAIL bloqueia a publicacao.

### Conteudo

- [ ] Post foi aprovado por humano (status = aprovado em memory/marketing.md)
- [ ] Legenda revisada pelo dono ou Rafael — nao apenas por Lia
- [ ] Nenhum preco, desconto ou prazo que nao foi validado
- [ ] Nenhum claim medico, financeiro ou juridico sem fonte
- [ ] Nenhum dado pessoal de cliente no conteudo (LGPD)
- [ ] Nenhum rosto de pessoa real sem autorizacao registrada em memory/marca.md
- [ ] Nenhuma marca de concorrente mencionada
- [ ] Imagem tem URL HTTPS publica e acessivel

### Tecnico

- [ ] `META_ACCESS_TOKEN` configurado como variavel de ambiente
- [ ] `INSTAGRAM_USER_ID` configurado como variavel de ambiente
- [ ] Token valido (nao expirado) — verificado via debug_token
- [ ] Rate limit verificado — quota_usage < 25
- [ ] Imagem no formato correto (JPEG/PNG, max 8 MB)
- [ ] Legenda dentro do limite de 2.200 chars
- [ ] Hashtags: maximo 30

### Pos-publicacao

- [ ] media_id salvo em memory/marketing.md
- [ ] Status atualizado para publicado em memory/marketing.md
- [ ] Rafael notificado com permalink do post
- [ ] Data e hora de publicacao registradas

---

## 8. Processo completo de Lia ao publicar

```
1. Receber solicitacao de publicacao com id da campanha (ex: cmp-2026-06-12-bella-vida-namorados)

2. Consultar memory/marketing.md:
   - Verificar status = aprovado (nao rascunho)
   - Recuperar path da imagem e legenda

3. Verificar variaveis de ambiente:
   - META_ACCESS_TOKEN setado?
   - INSTAGRAM_USER_ID setado?
   - Se nao: parar e alertar Rafael

4. Verificar token:
   - GET /debug_token — token valido?
   - Se expirado: alertar Rafael para renovar

5. Verificar rate limit:
   - GET /{ig-user-id}/content_publishing_limit
   - quota_usage < 25?

6. Montar URL publica da imagem:
   - GET /api/marketing/public-base-url
   - Verificar se URL e acessivel via HTTPS

7. Passar checklist de conformidade (Secao 7)

8. Criar media container:
   - POST /{ig-user-id}/media com image_url e caption
   - Aguardar status = FINISHED

9. Publicar:
   - POST /{ig-user-id}/media_publish com creation_id
   - Receber media_id

10. Atualizar memory/marketing.md:
    - status: publicado
    - media_id: {media_id}
    - data_publicacao: {timestamp}
    - permalink: https://www.instagram.com/p/{shortcode}/

11. Entregar ao Rafael:
    - Permalink do post
    - media_id
    - Confirmacao de publicacao
```

---

## 9. Tratamento de erros comuns

| Erro da API | Causa | Solucao |
|---|---|---|
| `#190` — Invalid OAuth Token | Token expirado ou invalido | Renovar token via OAuth flow |
| `#100` — Invalid parameter | Parametro incorreto ou ausente | Verificar image_url, caption, ig-user-id |
| `#36000` — Quota limit reached | 25 posts/24h atingido | Aguardar renovacao; verificar content_publishing_limit |
| `#9007` — URL not accessible | Imagem nao esta acessivel publicamente | Verificar se PICOCLAW_PUBLIC_BASE_URL esta setado e URL tem HTTPS |
| `#24` — Unknown error | Geralmente timeout ou erro transiente | Retry apos 30s; maximo 3 tentativas |
| `#368` — Blocked for policy | Conteudo violou politica da Meta | Revisar imagem e legenda; nao retentar automaticamente |

---

## 10. O que esta skill NAO faz

- Nao publica sem aprovacao humana registrada em memory/marketing.md
- Nao armazena tokens em arquivos de memoria
- Nao usa agent-browser, Selenium, Puppeteer ou automacao de browser
- Nao publica Stories (nao suportado pela Graph API para apps nao-parceiros)
- Nao garante alcance, engajamento ou resultado de campanha
- Nao gerencia anuncios pagos (isso e via Meta Ads API, fora do escopo desta skill)
- Nao faz login manual no Instagram — toda autenticacao e via OAuth 2.0

---

## 11. Saida obrigatoria apos publicacao

```
PUBLICACAO:
Post publicado com sucesso no Instagram.

CAMPANHA: {id da campanha}
MEDIA ID: {media_id}
PERMALINK: https://www.instagram.com/p/{shortcode}/
PUBLICADO EM: {timestamp ISO 8601}
CONTA: @{instagram_handle}

MEMORIA: memory/marketing.md atualizado — status: publicado

PROXIMO PASSO:
Verificar performance em D+7 via GET /{media-id}?fields=like_count,comments_count,reach
```

---

## 12. Dependencias de infraestrutura

Para que esta skill funcione, o ambiente Picoclaw deve ter:

| Dependencia | Tipo | Descricao |
|---|---|---|
| `META_ACCESS_TOKEN` | Env var | Page Access Token de longa duracao da Meta |
| `INSTAGRAM_USER_ID` | Env var | ID numerico da conta Instagram Business/Creator |
| `PICOCLAW_PUBLIC_BASE_URL` | Env var | URL base HTTPS para servir arquivos publicos |
| `GET /api/marketing/public-base-url` | Endpoint interno | Retorna base URL para montar links de midia |
| Imagens servidas via HTTPS | Infraestrutura | workspace/public/marketing/ deve estar acessivel na internet |
| Motor de geracao de imagem | Servico externo | Necessario para gerar os arquivos PNG reais (conectado a gerar-imagem-post) |

---

*Skill criada como resultado do teste: teste-instagram-publicacao-2026-05-22.md*
*Data: 2026-05-22*
*Status: especificacao — pendente de implementacao*
