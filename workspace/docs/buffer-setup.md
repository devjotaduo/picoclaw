# Guia de configuracao: Buffer + Instagram Business

Configure em ~30 minutos. Sem Meta App. Sem formulario de aprovacao.

---

## Pre-requisitos

- Conta no Instagram (Business ou Creator)
- E-mail para criar conta no Buffer

---

## Passo 1 — Criar conta no Buffer

1. Acesse https://buffer.com
2. "Get started for free"
3. Confirme o e-mail
4. Na tela de onboarding, clique em "Connect a channel"
5. Selecione Instagram
6. Faca login com a conta do Instagram Business
7. Autorize o Buffer

> Se sua conta Instagram for pessoal (nao Business), o Buffer vai pedir pra converter.
> Instagram > Configuracoes > Conta > Mudar para conta profissional > Empresa.

---

## Passo 2 — Obter o Access Token

O Buffer nao tem uma tela "gere seu token" no dashboard. Ha duas formas:

### Forma A — Token de app pessoal (mais simples, recomendada)

1. Acesse https://buffer.com/developers/apps
2. "Create an App"
3. Preencha:
   - Name: `Picoclaw - <nome do tenant>`
   - Description: `Publicacao automatizada de posts`
   - Callback URL: `https://SEU-SUBDOMINIO.jotaduo.com/oauth/buffer/callback` (pode ser qualquer URL valida por enquanto)
4. Clique em "Create App"
5. Anote o **Client ID** e o **Client Secret**
6. Abra no navegador (substituindo CLIENT_ID):
   ```
   https://bufferapp.com/oauth2/authorize?client_id=CLIENT_ID&redirect_uri=https://SEU-SUBDOMINIO.jotaduo.com/oauth/buffer/callback&response_type=code
   ```
7. Autorize o app
8. Voce sera redirecionado para a URL de callback com `?code=XXXXXX` na URL
9. Copie o `code` e troque por access_token:
   ```bash
   curl -X POST https://api.bufferapp.com/1/oauth2/token.json \
     -d "client_id=CLIENT_ID" \
     -d "client_secret=CLIENT_SECRET" \
     -d "redirect_uri=https://SEU-SUBDOMINIO.jotaduo.com/oauth/buffer/callback" \
     -d "code=XXXXXX" \
     -d "grant_type=authorization_code"
   ```
   Resposta:
   ```json
   {"access_token": "1/xxxxxxxxxxxxxxxxxxxxxxx"}
   ```
10. Salve o `access_token`

### Forma B — Token via Postman ou Insomnia (sem codigo)

Use o fluxo OAuth2 Authorization Code no Postman:
- Authorization URL: `https://bufferapp.com/oauth2/authorize`
- Token URL: `https://api.bufferapp.com/1/oauth2/token.json`
- Preencha Client ID / Secret e clique "Get New Access Token"

---

## Passo 3 — Obter o Profile ID do Instagram

```bash
curl "https://api.bufferapp.com/1/profiles.json?access_token=SEU_TOKEN"
```

Resposta (resumida):
```json
[
  {
    "id": "5eb9a1a2b5c4d2001f000001",
    "service": "instagram",
    "service_username": "minhaempresa",
    "formatted_username": "@minhaempresa"
  },
  ...
]
```

Copie o `id` do perfil Instagram. Esse e o `BUFFER_INSTAGRAM_PROFILE_ID`.

---

## Passo 4 — Salvar as variaveis no Picoclaw

### Via dashboard (recomendado)

1. Acesse o dashboard do Picoclaw: `https://SEU-SUBDOMINIO.jotaduo.com`
2. Configuracoes > Variaveis de Ambiente (ou Integrações > Buffer)
3. Adicione:
   - `BUFFER_ACCESS_TOKEN` = `1/xxxxxxxxxxxxxxxxxxxxxxx`
   - `BUFFER_INSTAGRAM_PROFILE_ID` = `5eb9a1a2b5c4d2001f000001`
4. Salve e reinicie o gateway

### Via arquivo .env (dev local)

```bash
# Adicionar ao arquivo de ambiente do container
echo "BUFFER_ACCESS_TOKEN=1/xxxxxxxxxxxxxxxxxxxxxxx" >> /etc/picoclaw/tenant.env
echo "BUFFER_INSTAGRAM_PROFILE_ID=5eb9a1a2b5c4d2001f000001" >> /etc/picoclaw/tenant.env
```

---

## Passo 5 — Testar

```bash
# Teste rapido — deve retornar {"ok":true,...}
curl -s -X POST http://localhost:18800/api/marketing/buffer-publish \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://picsum.photos/1080/1080",
    "caption": "Post de teste via Picoclaw. #teste",
    "campaign_id": "teste-buffer-001",
    "approved_by": "Rafael"
  }'
```

Resposta esperada:
```json
{
  "ok": true,
  "buffer_update_id": "5eb9a1a2b5c4d2001f12345a",
  "status": "pending",
  "due_at": "2026-05-22T15:00:00Z",
  "share_url": "https://buffer.com/add"
}
```

Se retornar `"Buffer not configured"`, verificar se as variaveis de ambiente estao setadas e se o gateway foi reiniciado.

---

## Passo 6 — Pedir para Lia publicar

Agora basta falar com a Lia:

```
Rafael: "Lia, agenda o post de Dia dos Namorados para o dia 12 de junho às 10h"
```

Lia vai:
1. Verificar o post aprovado em `memory/marketing.md`
2. Chamar `POST /api/marketing/buffer-publish` com `schedule_at`
3. Retornar o ID do Buffer e confirmar o agendamento

---

## Limites do plano Free

| Recurso | Free | Essentials ($6/mes) |
|---|---|---|
| Canais conectados | 3 | 1 por canal (mais barato) |
| Posts na fila | 10 por canal | Ilimitado |
| Posts publicados/mes | Ilimitado | Ilimitado |
| Primeiro comentario | Nao | Sim |
| Agendamento avancado | Sim | Sim |

10 posts na fila = suficiente para a maioria dos tenants (1-2 posts por dia = 5-10 dias de fila).

---

## Solucao de problemas

### "401 Unauthorized" do Buffer
- Token expirado ou invalido
- Gerar novo token seguindo o Passo 2

### "You have reached the maximum number of pending updates"
- Fila cheia (10 posts no Free)
- Aguardar publicacao de algum post OU fazer upgrade para Essentials

### "The media could not be processed"
- Imagem deve ser JPEG ou PNG
- Tamanho maximo: 8 MB
- URL deve ser HTTPS e acessivel publicamente (testar em aba anonima)

### Perfil nao aparece
- Reconectar o Instagram no Buffer: buffer.com > Settings > Channels

---

## Seguranca

- O token do Buffer tem acesso de leitura e escrita aos canais conectados
- Nunca compartilhar o token no AGENT.md, commits ou logs
- O backend le o token via variavel de ambiente — nunca e exposto nas respostas da API
- Revogar token em: buffer.com > Settings > Apps > revogar acesso
