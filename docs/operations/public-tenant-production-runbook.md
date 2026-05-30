# Public tenant production runbook

Este runbook cobre o caminho vivo de produção:

`tenant público -> Sofia no /pico/ws -> Catarina via jotaduo-wa -> resposta do lead -> promoção -> recreate`.

## Criar tenant público

1. Entre no admin SaaS.
2. Abra `Novo tenant`.
3. Selecione tipo `Público`.
4. Escolha workspace `publico` quando o teste for do fluxo público canônico.
5. Defina um subdomínio curto e único.
6. Crie e abra o subdomínio retornado.

Validação mínima:

```bash
curl -sS https://<subdominio>.jotaduo.com/api/launcher/ui-visibility
curl --http1.1 -k -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==' \
  https://<subdominio>.jotaduo.com/pico/ws
```

Esperado:

- `active_profile=public`
- `/pico/ws` responde `101 Switching Protocols`

## Validar Sofia e Catarina

1. No subdomínio público, converse com Sofia até concluir o discovery.
2. Confirme no volume:

```bash
ssh pico 'cat /srv/saas/tenants/<tenant-id>/workspace/state/onboarding.json'
```

3. Catarina deve enviar a primeira mensagem pelo WhatsApp institucional.
4. O lead responde no WhatsApp real.
5. Confirme inbound no tenant:

```bash
ssh pico 'tail -n 20 /srv/saas/tenants/<tenant-id>/workspace/state/jotaduo-wa-inbox.jsonl'
```

6. Catarina consome a resposta e marca aprofundamentos suficientes para promoção.

## Promover tenant

Pelo painel admin, abra o tenant e use o card `Promover`.

Pela API, quando necessário:

```bash
curl -sS -X POST \
  -H 'Content-Type: application/json' \
  -b /tmp/picoclaw-admin.cookies \
  https://admin.jotaduo.com/api/v1/tenants/<tenant-id>/promote \
  -d '{}'
```

Use `force=true` apenas para incidente operacional, sempre com motivo:

```json
{
  "force": true,
  "force_reason": "validacao manual concluida fora da state machine",
  "owner_email": "cliente@example.com"
}
```

Validação depois da promoção:

```bash
ssh pico 'docker ps --filter name=tenant-<tenant-id>'
ssh pico 'docker exec postgres psql -U picoclaw -d picoclaw_control -Atc "select is_public,auth_backend,status from tenants where id='\'<tenant-id>\'';"'
curl -sS https://<subdominio>.jotaduo.com/api/launcher/ui-visibility
```

Esperado:

- `is_public=false`
- `auth_backend=launcher`
- `active_profile=tenant`
- login do dono funcionando
- rota do tenant revogada em `jotaduo-wa/routing.db`

## Recriar tenant com imagem nova

O deploy automático só atualiza serviços centrais. Ele deixa
`picoclaw-launcher:latest` disponível no VPS; tenants existentes precisam
de recreate explícito.

Com CLI no controlplane:

```bash
ssh pico 'docker exec controlplane picoclaw-tenantctl recreate <tenant-id>'
```

Com API:

```bash
curl -sS -X POST \
  -b /tmp/picoclaw-admin.cookies \
  https://admin.jotaduo.com/api/v1/tenants/<tenant-id>/recreate
```

Valide:

```bash
ssh pico 'docker inspect tenant-<tenant-id> --format "{{.State.Health.Status}} {{.Image}}"'
curl -sS https://<subdominio>.jotaduo.com/api/launcher/ui-visibility
```

## Limpar sobras antigas

Antes de remover qualquer container:

```bash
ssh pico 'docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Labels}}"'
ssh pico 'docker inspect <container> --format "{{json .Mounts}}"'
```

Pode remover sem preservar volume quando todas as condições forem verdade:

- não começa com `tenant-`
- não pertence ao compose (`com.docker.compose.project` ausente ou antigo)
- não tem mount em `/srv/saas/tenants/<tenant-id>`
- não aparece na tabela `tenants.container_id`

Comando:

```bash
ssh pico 'docker rm -f <container>'
```

Tenants em `deleting` devem ser limpos pelo fluxo do controlplane sempre que
possível. Só remova volume manualmente depois de snapshot R2 recente e checagem
de que o tenant não representa cliente real.
