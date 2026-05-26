# Guia de configuracao: Make.com + Instagram Business

Configure em ~1 hora. Sem Meta App. Sem burocracia.

---

## Pre-requisitos

- Conta no Instagram (Business ou Creator)
- Pagina no Facebook (a conta Instagram precisa estar vinculada)
- E-mail para criar conta no Make.com

---

## Passo 1 — Converter conta Instagram para Business (se ainda nao for)

1. Abra o Instagram no celular
2. Perfil > Menu (tres riscos) > Configuracoes > Conta
3. "Mudar para conta profissional" > Empresa
4. Escolha a categoria do negocio
5. Vincule a uma Pagina do Facebook (crie uma pagina simples se nao tiver)

---

## Passo 2 — Criar conta no Make.com

1. Acesse https://make.com
2. "Get started free" — plano Free da 1.000 operacoes/mes
3. Confirme o e-mail

---

## Passo 3 — Criar o cenario no Make

### 3.1 Novo cenario

1. Dashboard > "Create a new scenario"
2. Clique no "+" para adicionar o primeiro modulo
3. Busque "Webhooks" > selecione **Custom webhook**
4. Clique em "Add" para criar um novo webhook
5. Copie a URL gerada (ex: `https://hook.eu2.make.com/abc123xyz`) — esta e a `MAKE_INSTAGRAM_WEBHOOK_URL`
6. Clique em "OK"

### 3.2 Conectar o Instagram

1. Clique no "+" apos o modulo Webhook
2. Busque "Instagram for Business" > selecione **Create a Photo Media Object**
3. Em "Connection" > "Add" > Authorize no pop-up
4. Faca login com a conta do Facebook vinculada ao Instagram Business
5. Autorize o Make a acessar sua conta

### 3.3 Mapear os campos

No modulo "Create a Photo Media Object":

| Campo Make | Valor (da variavel do webhook) |
|---|---|
| Instagram Account ID | Selecione sua conta |
| Image URL | `{{1.image_url}}` |
| Caption | `{{1.caption}}` |

### 3.4 Publicar a imagem

1. Clique no "+" apos o modulo anterior
2. "Instagram for Business" > **Publish a Media Object**
3. Instagram Account ID: mesmo da etapa anterior
4. Creation ID: `{{2.id}}` (retorno do modulo anterior)

### 3.5 Primeiro comentario (opcional)

1. "+" > "Instagram for Business" > **Create a Comment**
2. Media ID: `{{3.id}}`
3. Text: `{{1.first_comment}}`
4. Adicione um filtro: so executa se `{{1.first_comment}}` nao for vazio

### 3.6 Retornar resposta para Lia

1. "+" > "Webhooks" > **Webhook response**
2. Status: `200`
3. Body:
```json
{
  "status": "published",
  "post_id": "{{3.id}}",
  "permalink": "https://www.instagram.com/p/{{3.shortcode}}/",
  "timestamp": "{{now}}"
}
```

---

## Passo 4 — Ativar e testar o cenario

1. Clique em "Save" (disco)
2. Ligue o cenario (toggle no canto inferior esquerdo)
3. Teste com curl:

```bash
curl -X POST "https://hook.eu2.make.com/SUA_URL_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://picsum.photos/1080/1080",
    "caption": "Post de teste. #teste",
    "media_type": "IMAGE",
    "campaign_id": "teste-001",
    "approved_by": "Rafael",
    "approved_at": "2026-05-22T10:00:00-03:00"
  }'
```

Resposta esperada:
```json
{"status": "published", "post_id": "...", "permalink": "..."}
```

---

## Passo 5 — Salvar a URL no Picoclaw

Adicione a variavel de ambiente no container do tenant:

```bash
# No arquivo .env do workspace ou na config do controlplane
MAKE_INSTAGRAM_WEBHOOK_URL=https://hook.eu2.make.com/SUA_URL_AQUI
```

Ou via dashboard do Picoclaw: Configuracoes > Variaveis de Ambiente > Adicionar.

---

## Limites do plano Free

| Recurso | Free | Core ($9/mes) |
|---|---|---|
| Operacoes/mes | 1.000 | 10.000 |
| Cenarios ativos | 2 | Ilimitado |
| Agendamento | 15 min | 1 min |
| Historico de execucao | 30 dias | 30 dias |

1 post = 3-4 operacoes (webhook + criar media + publicar + comentario).
No Free: ~250 posts/mes — mais que suficiente para a maioria dos negocfavour.

---

## Solucao de problemas

### "IMAGE_NOT_ACCESSIBLE"
- A URL da imagem precisa ser HTTPS e publica (sem cookie, sem login)
- Testar: abrir a URL em aba anonima do navegador
- Verificar se `PICOCLAW_PUBLIC_BASE_URL` esta setado corretamente

### "The image could not be downloaded"
- Instagram so aceita JPEG ou PNG
- Tamanho maximo: 8 MB
- Resolucao minima: 320px

### Conta nao aparece no Make
- Verificar se a conta Instagram esta vinculada a uma Pagina do Facebook
- Reconectar o Instagram no Make: Connections > reconectar

### Cenario nao dispara
- Verificar se o cenario esta ligado (toggle verde)
- Verificar se a URL do webhook esta correta (sem espacos ou caracteres extras)

---

## Seguranca

- Nunca compartilhe a URL do webhook publicamente — quem tiver a URL pode postar na sua conta
- Adicione um campo secreto para validar origem (opcional):
  - No webhook do Make, adicione um filtro: `{{1.secret}} == SEU_SEGREDO`
  - Lia inclui `"secret": "$MAKE_WEBHOOK_SECRET"` no payload
