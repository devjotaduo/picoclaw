---
name: publicar-instagram-buffer
description: Publica ou agenda post no Instagram via Buffer API (oficial, gratis ate 10 posts na fila). Lia chama POST /api/marketing/buffer-publish no proprio launcher; o backend repassa para a Buffer API usando BUFFER_ACCESS_TOKEN e BUFFER_INSTAGRAM_PROFILE_ID configurados pelo Rafael. Nao requer Meta App proprio.
visibility: internal
depends_on:
  - marketing/criar-post-instagram
  - marketing/gerar-imagem-post
  - consultar-memoria
  - atualizar-memoria
requires_approval: true
requires_human_confirmation: true
env_required:
  - BUFFER_ACCESS_TOKEN
  - BUFFER_INSTAGRAM_PROFILE_ID
---

# Skill: publicar-instagram-buffer

> **Provedor de `marketing/publicar-instagram`.** Não invocar direto — Lia
> sempre entra por `publicar-instagram`, que roteia pra cá quando o Buffer é o
> canal configurado. As regras universais (aprovação, sem claim, registro
> pós-publicação) vêm de lá.

Agenda ou publica post no Instagram via **Buffer API** — sem Meta App, sem burocracia, gratuito ate 10 posts na fila.

> So chamar apos aprovacao humana registrada em `memory/marketing.md`.

---

## Comparativo rapido

| | Buffer Free | Make.com Free |
|---|---|---|
| Setup | ~30 min | ~1h |
| Fila simultanea | 10 posts | Ilimitado |
| Posts/mes | Ilimitado | 1.000 ops |
| Agendamento | Sim (horario livre) | Sim (Make Pro) |
| OAuth por tenant | Sim | Sim |
| Custo | R$0 | R$0 |

---

## 1. Pre-requisitos (Rafael configura uma vez)

1. Conta no Buffer (https://buffer.com) — plano Free
2. Instagram Business ou Creator conectado ao Buffer
3. Access token gerado (ver `workspace/docs/buffer-setup.md`)
4. Variaveis de ambiente configuradas no container:
   - `BUFFER_ACCESS_TOKEN=...`
   - `BUFFER_INSTAGRAM_PROFILE_ID=...`

---

## 2. Como Lia chama

```bash
# Verificar se esta configurado
curl -s http://localhost:18800/api/marketing/buffer-publish \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"image_url":"test","caption":"test"}' | grep -q "Buffer not configured" && \
  echo "ERRO: configurar BUFFER_ACCESS_TOKEN e BUFFER_INSTAGRAM_PROFILE_ID" || \
  echo "Buffer configurado"
```

```bash
# Publicar imediatamente
curl -s -X POST http://localhost:18800/api/marketing/buffer-publish \
  -H "Content-Type: application/json" \
  -d "{
    \"image_url\": \"$IMAGE_URL\",
    \"caption\": \"$CAPTION\",
    \"campaign_id\": \"$CAMPAIGN_ID\",
    \"approved_by\": \"$APPROVED_BY\"
  }"
```

```bash
# Agendar para data especifica
curl -s -X POST http://localhost:18800/api/marketing/buffer-publish \
  -H "Content-Type: application/json" \
  -d "{
    \"image_url\": \"$IMAGE_URL\",
    \"caption\": \"$CAPTION\",
    \"schedule_at\": \"2026-06-12T10:00:00-03:00\",
    \"campaign_id\": \"$CAMPAIGN_ID\",
    \"approved_by\": \"$APPROVED_BY\"
  }"
```

---

## 3. Campos do request

| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| `image_url` | string | Sim | URL HTTPS da imagem (max 8 MB) |
| `caption` | string | Sim | Legenda + hashtags (max 2.200 chars) |
| `first_comment` | string | Nao | Primeiro comentario (Buffer Pro; ignorado no Free) |
| `schedule_at` | ISO 8601 | Nao | Data/hora de publicacao. Ausente = imediato |
| `campaign_id` | string | Nao | ID da campanha para log |
| `approved_by` | string | Nao | Nome de quem aprovou para log |

---

## 4. Respostas

### Sucesso
```json
{
  "ok": true,
  "buffer_update_id": "5eb9a1a2b5c4d2001f12345a",
  "status": "pending",
  "due_at": "2026-06-12T13:00:00Z",
  "share_url": "https://buffer.com/add"
}
```

### Buffer nao configurado (503)
```json
{
  "ok": false,
  "error": "Buffer not configured. Set BUFFER_ACCESS_TOKEN and BUFFER_INSTAGRAM_PROFILE_ID."
}
```

Lia deve informar Rafael: "Buffer nao esta configurado. Seguir `workspace/docs/buffer-setup.md`."

### Imagem inacessivel (400)
```json
{
  "ok": false,
  "error": "image_url must start with https://",
  "buffer_error": ""
}
```

### Fila cheia (502 com erro Buffer)
```json
{
  "ok": false,
  "error": "Buffer API error",
  "buffer_error": "You have reached the maximum number of pending updates."
}
```

Lia deve informar: "Fila do Buffer esta cheia (10 posts). Aguardar publicacao de um post ou Rafael fazer upgrade para Buffer Essentials."

---

## 5. Fluxo completo

```
Rafael: "Lia, agenda esse post pro dia 12 de junho as 10h"
  |
  v
Lia verifica: post aprovado em memory/marketing.md? → Sim
  |
  v
Lia verifica: imagem salva em workspace/public/marketing/ → link HTTPS disponivel?
  |
  v
Lia chama POST /api/marketing/buffer-publish com schedule_at
  |
  v
Sucesso → Lia registra em memory/marketing.md:
  status: agendado-buffer
  buffer_update_id: 5eb9a1a2...
  due_at: 2026-06-12T13:00:00Z
  |
  v
Lia informa Rafael:
  "Agendado para 12/06 às 10h (horário de Brasília).
   ID no Buffer: 5eb9a1a2...
   Voce pode ver e editar em buffer.com/app."
```

---

## 6. O que Lia registra apos sucesso

```markdown
## Campanha: <slug>
- Status: agendado-buffer
- Data agendada: YYYY-MM-DD HH:MM (BRT)
- Buffer Update ID: <id>
- Aprovado por: <nome>
- Imagem: <url>
- Campanha: <campaign_id>
```

---

## 7. Limites Buffer Free

| Limite | Valor |
|---|---|
| Posts na fila simultaneamente | 10 por perfil |
| Total de posts publicados/mes | Ilimitado |
| Perfis sociais | 3 canais |
| Agendamento minimo | Imediato |
| Primeiro comentario | Apenas Buffer Pro ($6/mes) |

---

## 8. Checklist pre-publicacao

- [ ] Post aprovado por Rafael ou dono
- [ ] Imagem HTTPS acessivel sem login
- [ ] Caption revisada (sem preco inventado, sem claim, sem concorrente)
- [ ] Hashtags adequadas ao segmento
- [ ] Campanha registrada em `memory/marketing.md` com status=aprovado
- [ ] Menos de 25 posts publicados nas ultimas 24h (limite Instagram)
- [ ] Fila do Buffer tem espaco (menos de 10 posts pendentes)

---

## 9. O que esta skill NAO faz

- Nao publica Stories
- Nao faz login via browser
- Nao armazena token (o backend le do env do container)
- Nao garante horario exato — Buffer publica no slot mais proximo disponivel
- Primeiro comentario automatico requer Buffer Pro
