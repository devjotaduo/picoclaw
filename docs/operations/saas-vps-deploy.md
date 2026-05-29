# SaaS deploy on a fresh Linux VPS

This runbook produces the same state as the live deploy on
`155.138.210.187` (Vultr Ubuntu 24.04, Docker 29.5.1).

Tested topology:
- One VPS, public DNS pointing both `${SAAS_BASE_DOMAIN}` and
  `*.${SAAS_BASE_DOMAIN}` to its IP.
- Traefik terminates TLS via Let's Encrypt HTTP-01 challenge (no Cloudflare
  token required). Wildcard DNS suffices because each tenant subdomain
  resolves to this same VPS and Traefik requests certs lazily.
- All services run as containers via `docker compose`.

---

## 0. Prerequisites

- Public IP, root SSH, ports 80 + 443 open.
- DNS A records:
  - `${SAAS_BASE_DOMAIN}` → VPS IP
  - `*.${SAAS_BASE_DOMAIN}` → VPS IP

## 1. OS packages + Docker

```bash
apt-get update -qq
apt-get install -y ca-certificates curl gnupg git jq python3 ufw fail2ban
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 2. Lower Docker daemon `MinAPIVersion`

**Required on Docker ≥ 29.x.** The daemon defaults to `MinAPIVersion=1.40`,
but Traefik's docker provider falls back to API 1.24 when version negotiation
fails (which it does behind `tecnativa/docker-socket-proxy:0.3`). Result:
Traefik can't list any containers and no routes ever come up.

```bash
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/api-version.conf <<'CONF'
[Service]
Environment="DOCKER_MIN_API_VERSION=1.24"
CONF
systemctl daemon-reload
systemctl restart docker
```

Verify:
```bash
curl -s --unix-socket /var/run/docker.sock http://localhost/version | jq .MinAPIVersion
# → "1.24"
```

The compose's traefik service ALSO bind-mounts `/var/run/docker.sock` directly
(no proxy), which is the second half of the fix.

## 3. Filesystem layout

```bash
install -d -m 755 /srv/saas
install -d -m 755 /srv/saas/tenants
install -d -m 700 /srv/saas/traefik
install -m 600 /dev/null /srv/saas/traefik/acme.json
install -d -m 755 /srv/saas/postgres/data
install -d -m 755 /srv/saas/controlplane/data
install -d -m 755 /srv/saas/controlplane/data/launcher-profiles
install -d -m 755 /srv/saas/backups
install -d -m 755 /srv/saas/opencrm/data
install -d -m 755 /srv/picoclaw-workspaces  # workspaces live here (one dir per slug)
```

## 4. Runtime bundle + first workspace

Do not sync a developer working tree to the VPS. Production only needs a small
runtime bundle under `/srv/saas/picoclaw/`:

- `docker/saas/docker-compose.prod.yml`
- `docker/saas/traefik/`
- `docker/saas/litellm/`
- `docker/saas/postgres/`
- `scripts/auto-deploy/` only during timer installation

One bootstrap path from a clean checkout:

```bash
cd /tmp && git clone https://github.com/devjotaduo/picoclaw.git picoclaw-bootstrap
cd picoclaw-bootstrap
install -d /srv/saas/picoclaw/docker/saas
cp -a docker/saas/docker-compose.prod.yml docker/saas/traefik docker/saas/litellm docker/saas/postgres /srv/saas/picoclaw/docker/saas/
sudo bash scripts/auto-deploy/install.sh
```

Workspaces are created via the admin UI (`adm.<base>/workspaces`) after the
controlplane is running — see [`docs/architecture/workspaces.md`](../architecture/workspaces.md)
for the on-disk layout the admin creates.

## 5. `.env`

Generate `/srv/saas/picoclaw/.env` (mode 600). Required keys (see
`.env.supabase.example` for the Supabase + auto-provision block):

```
SAAS_BASE_DOMAIN=jotaduo.com
LE_EMAIL=dev@jotaduo.com

POSTGRES_USER=picoclaw
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB_CONTROL=picoclaw_control
POSTGRES_DB_LITELLM=litellm

JWT_SECRET=<openssl rand -hex 32>
PICOCLAW_SAAS_GATEWAY_SECRET=<openssl rand -hex 32>

LITELLM_MASTER_KEY=sk-<openssl rand -hex 16>
LITELLM_URL=http://litellm:4000
OPENROUTER_API_KEY=sk-or-v1-...

TENANT_IMAGE=picoclaw-launcher:latest
TENANT_HOST_DATA_DIR=/srv/saas/tenants
PICOCLAW_WORKSPACE_DIR=/srv/picoclaw-workspaces

SUPABASE_PROJECT_REF=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=                # empty for ES256 projects; keyfunc uses JWKS
SUPABASE_SITE_URL=https://jotaduo.com

TZ=America/Sao_Paulo
```

## 6. Pull prebuilt images

```bash
cd /srv/saas/picoclaw
docker pull ghcr.io/devjotaduo/picoclaw-saas:main
docker pull ghcr.io/devjotaduo/picoclaw-launcher:main
docker pull ghcr.io/devjotaduo/picoclaw-browser-sidecar:main
docker pull ghcr.io/devjotaduo/picoclaw-opencrm:main
docker tag ghcr.io/devjotaduo/picoclaw-saas:main picoclaw/saas:latest
docker tag ghcr.io/devjotaduo/picoclaw-launcher:main picoclaw-launcher:latest
docker tag ghcr.io/devjotaduo/picoclaw-browser-sidecar:main picoclaw/browser-sidecar:latest
docker tag ghcr.io/devjotaduo/picoclaw-opencrm:main picoclaw/opencrm:latest
```

## 7. Up

```bash
docker compose -f docker/saas/docker-compose.prod.yml --env-file .env up -d
```

Watch:
```bash
docker compose -f docker/saas/docker-compose.prod.yml --env-file .env ps
docker logs -f traefik     # cert issuance lands within ~30s after first request
```

## 8. Install the tenant-router watcher

Traefik's `letsencrypt` resolver issues a cert lazily per concrete `Host()`
rule. The controlplane router uses a `HostRegexp` to catch every tenant
subdomain at request time, but Traefik never pre-issues certs for regex
matches — so the first request to `https://<sub>.${SAAS_BASE_DOMAIN}/`
fails the TLS handshake with `unrecognized name`.

The watcher fixes this: it listens to docker events for tenant containers
(`label=picoclaw.saas.managed=true`) and writes a per-tenant `Host()`
router into `docker/saas/traefik/dynamic/tenants.yml`. Traefik picks the
file up via its file-watcher and requests the cert lazily.

Install once on the VPS as root:

```bash
sudo docker/saas/scripts/tenant-router/install.sh
# or for a different base domain:
sudo SAAS_BASE_DOMAIN=example.com docker/saas/scripts/tenant-router/install.sh
```

Verify:

```bash
systemctl status picoclaw-tenant-router.service
journalctl -u picoclaw-tenant-router.service -f
```

The unit runs `picoclaw-tenant-router-watch` which calls
`picoclaw-traefik-tenants` on each `create`/`start`/`die`/`destroy`/`rename`
of a tenant container, debouncing bursts (default 3s).

## 9. Bootstrap admin & sanity

```bash
NEWPWD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-22)
docker compose exec controlplane /usr/local/bin/picoclaw-tenantctl \
  bootstrap-admin --email dev@jotaduo.com --password "$NEWPWD" --reset
# Save NEWPWD to a root-only file, then sign in at https://admin.${SAAS_BASE_DOMAIN}/
```

### Sanity

```bash
curl -sS https://${SAAS_BASE_DOMAIN}/                       # 200, SPA
curl -sS https://admin.${SAAS_BASE_DOMAIN}/                 # 200, SPA
# After creating a tenant público in the admin UI:
curl -sS https://<public-subdomain>.${SAAS_BASE_DOMAIN}/api/launcher/ui-visibility
curl -i -N --http1.1 \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H 'Sec-WebSocket-Version: 13' \
  https://<public-subdomain>.${SAAS_BASE_DOMAIN}/pico/ws
```

## Known landmines (already mitigated in repo)

| Symptom | Cause | Mitigation |
|---|---|---|
| Traefik logs `client version 1.24 is too old` | dockerproxy v0.3 + Docker ≥ 29.x | Step 2 (daemon `DOCKER_MIN_API_VERSION=1.24`) + Traefik now mounts `/var/run/docker.sock` directly |
| ACME error `unable to parse email address` with `${LE_EMAIL}` | Traefik does not interpolate env vars in static YAML | `traefik.yml` hard-codes `email: "dev@jotaduo.com"` (fork the file when reusing the stack) |
| `Error while building configuration ... routers cannot be a standalone element` | Empty `routers: {}` / `services: {}` at top level of a dynamic file | Removed from `security-headers.yml` |
| `Unable to parse certificate /etc/traefik/certs/dev.pem` | `dev-tls.yml` referenced mkcert files that don't exist in prod | Renamed to `dev-tls.yml.sample`; `dev-setup.sh` activates it for local dev only |
| Bare `${SAAS_BASE_DOMAIN}` returns TLS `unrecognized name` | Controlplane router rule did not include apex domain | Rule now matches `Host(${SAAS_BASE_DOMAIN}) \|\| Host(admin.${SAAS_BASE_DOMAIN}) \|\| HostRegexp(…)` |
| Tenant subdomain returns TLS `unrecognized name` even though DNS resolves | Traefik does not pre-issue certs for `HostRegexp` matches; the `letsencrypt` resolver only fires per concrete `Host()` rule | `docker/saas/scripts/tenant-router/` installs a systemd watcher that writes a per-tenant `Host()` router into `traefik/dynamic/tenants.yml` on every docker container lifecycle event (debounced 3s) |

## Operational notes

- `acme.json` is the only critical state outside Postgres — back it up.
- Tenant volumes live under `/srv/saas/tenants/<tenant_id>/`. The controlplane
  creates/removes them via the docker proxy (controlplane is still gated by
  `tecnativa/docker-socket-proxy:0.3` — Traefik is the only service that
  bypasses it).
- Reverse a deploy: stop the stack, restore `acme.json`, `postgres/data`, and
  tenant volumes from backup.
