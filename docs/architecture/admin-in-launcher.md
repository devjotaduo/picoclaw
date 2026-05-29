# Admin embutido no launcher (`web/frontend/admin/*`)

Status: shipped. Última revisão: 2026-05-18.

O caminho essencial de administração SaaS vive dentro do `picoclaw-launcher`
em rotas `/admin/*`. Não há login separado: o admin entra pelo
`/launcher-login` normal do launcher, e o launcher faz proxy backend para o
controlplane usando credenciais armazenadas em arquivo com permissão 600.

`web/saas-admin` (em `adm.<dominio>`) segue atendendo audit log, users,
agent/skills editor por tenant, CRM, server health e
**workspaces** (CRUD + build do frontend customizado por workspace).

## Escopo

Dentro do launcher (web/frontend, rotas TanStack file-based):

- `/admin/` — landing com atalhos.
- `/admin/tenants` — lista, busca, suspend/resume/restart inline.
- `/admin/tenants/new` — criação de tenant via workspace selecionado.
- `/admin/tenants/$id` — detalhe + ações (restart, recreate, rotate-password, clone, delete) + sanity checks ao vivo.
- `/admin/clone` — wizard de clone tenant -> tenant com sanity report da resposta.

## Quem vê o painel

Três condições obrigatórias:

1. O usuário está autenticado no **launcher** (cookie `picoclaw_dashboard`).
2. O processo do launcher tem `PICOCLAW_SAAS_ADMIN_MODE=true` no env.
3. O processo tem credenciais válidas em `PICOCLAW_SAAS_BASE_URL`,
   `PICOCLAW_SAAS_EMAIL`, `PICOCLAW_SAAS_PASSWORD` apontando para um
   `platform_admin` do controlplane.

Quando as três batem, `GET /api/launcher/policy` retorna `is_saas_admin: true`
— o sidebar adiciona o grupo "Administração" e o `AdminGuard` libera as
rotas `/admin/*`. Caso contrário o grupo some e cada rota cai em
`<Forbidden/>` com mensagem explicando o que faltou.

## Arquitetura

```
[browser]  https://ia.jotaduo.com
   │
   ▼
[Traefik]  router concreto Host(`ia.<dominio>`) para ACME/TLS
   │
   ▼
[controlplane] (internal/saas/api)
   ├── trata ia.<dominio> como host administrativo, nao tenant
   ├── serve SPA admin / landing fallback
   └── proxy tenant apenas para subdominios de tenant reais
```

Detalhes:

- **TLS**: `ia.<dominio>` precisa de `Host()` concreto no Traefik; `HostRegexp`
  sozinho casa HTTP depois do handshake, mas nao emite certificado antes.
- **Controlplane**: `ia.<dominio>` entra no mesmo admin SPA que `admin.<dominio>`;
  `tenantSubdomain()` deve ignorar `ia` para nao tentar buscar tenant chamado
  `ia`.

## Configuração

### Systemd unit (`/etc/systemd/system/picoclaw-main-dev.service`)

```ini
Environment="PICOCLAW_SAAS_ADMIN_MODE=true"
EnvironmentFile=-/etc/picoclaw/saas-admin.env
```

### Env file (`/etc/picoclaw/saas-admin.env`, chmod 600 root:root)

```env
PICOCLAW_SAAS_BASE_URL=http://127.0.0.1:18801
PICOCLAW_SAAS_EMAIL=dev@jotaduo.com
PICOCLAW_SAAS_PASSWORD=<senha do platform_admin>
```

A senha vive **só** no arquivo 600. O `Environment=` no unit ficaria
world-readable; usar `EnvironmentFile=` evita isso.

Para desabilitar o painel: setar `PICOCLAW_SAAS_ADMIN_MODE=false` no unit (ou
deixar o env file faltando), recarregar e reiniciar.

## Endpoints do proxy

Todos exigem cookie de launcher autenticado (middleware
`launcher_dashboard_auth`). Resposta JSON é o que o controlplane devolve.

| Método  | Path do launcher                              | Vai para no controlplane         |
|---------|-----------------------------------------------|----------------------------------|
| GET     | `/api/admin/saas/tenants`                     | `/api/v1/tenants`                |
| POST    | `/api/admin/saas/tenants`                     | `/api/v1/tenants` (create)       |
| GET     | `/api/admin/saas/tenants/{id}`                | `/api/v1/tenants/{id}`           |
| DELETE  | `/api/admin/saas/tenants/{id}`                | `/api/v1/tenants/{id}`           |
| POST    | `/api/admin/saas/tenants/{id}/clone`          | `/api/v1/tenants/{id}/clone`     |
| GET     | `/api/admin/saas/tenants/{id}/sanity`         | `/api/v1/tenants/{id}/sanity`    |
| POST    | `/api/admin/saas/tenants/{id}/suspend`        | …                                |
| POST    | `/api/admin/saas/tenants/{id}/resume`         | …                                |
| POST    | `/api/admin/saas/tenants/{id}/restart`        | …                                |
| POST    | `/api/admin/saas/tenants/{id}/recreate`       | …                                |
| POST    | `/api/admin/saas/tenants/{id}/rotate-password`| …                                |
| GET     | `/api/admin/saas/workspaces`                  | `/api/v1/workspaces`             |

Qualquer endpoint do controlplane (existente ou futuro) é acessível via
`/api/admin/saas/<resto-da-url>` — o proxy é catch-all e não precisa de
edição para acompanhar novos endpoints, apenas se quiser whitelist mais
restrita.

## Clone raw tenant -> tenant

Sem mudança em relação à versão anterior:

- Endpoint controlplane: `POST /api/v1/tenants/{id}/clone` (chamado do
  launcher via `/api/admin/saas/tenants/{id}/clone`).
- `Provisioner.CloneFromTenant` faz `CopyVolumeRaw` (sem `SanitizeSeed`),
  preserva segredos/dashboardauth.db/sessões, regenera LiteLLM key.
- `RunPostCloneChecks` valida arquivos, container running e `/health`,
  `/ready`. Resultado embutido na resposta.

## Sanity checks

Disponível em qualquer momento via
`GET /api/admin/saas/tenants/{id}/sanity`. Verifica:

| Check | Falha quando |
|---|---|
| `tenant_record` | tenant não existe ou erro de DB |
| `file:config.json` | volume sem `config.json` |
| `file:workspace/AGENT.md` | volume sem `AGENT.md` |
| `file:workspace/SOUL.md` | volume sem `SOUL.md` |
| `file:workspace/behavior.json` | warn (recomendado) |
| `file:launcher_policy.json` | warn (recomendado) |
| `file:dashboardauth.db` | warn (recomendado) |
| `file:litellm.key` | warn (recomendado) |
| `container:running` | container ausente/parado |
| `tenant_health` | `GET tenant-<id>:18800/health` falha |
| `tenant_ready` | `GET tenant-<id>:18800/ready` falha |

## Verificação end-to-end (dev)

1. `pnpm dev:api` rodando via systemd unit, com `PICOCLAW_VITE_DEV_URL` e
   `PICOCLAW_SAAS_ADMIN_MODE` no env (default desta máquina).
2. Em `/etc/picoclaw/saas-admin.env`, preencher `PICOCLAW_SAAS_PASSWORD`.
   `systemctl restart picoclaw-main-dev.service`.
3. Browser → `https://ia.jotaduo.com/launcher-login` → entra com senha do
   dashboard local.
4. Sidebar mostra grupo "Administração" → clica em "Tenants".
5. `/admin/tenants` lista via `/api/admin/saas/tenants`.
6. Operações (clone/restart/suspend/etc.) tudo via proxy local.

## Fora de escopo

- Portar telas restantes do `web/saas-admin` (audit, users, CRM,
  agent editor por tenant, workspaces).
- Snapshot tenant-as-workspace (criar workspace novo a partir de um tenant
  existente).
- Refresh automático da sessão controlplane antes de expirar (hoje é lazy +
  retry em 401).
- Tipos compartilhados (OpenAPI/zod) entre `web/saas-admin` e `web/frontend`.
