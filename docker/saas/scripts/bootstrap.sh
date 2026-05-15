#!/usr/bin/env bash
# First-time installation on a fresh VPS. Idempotent.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (or via sudo)." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_DIR"

echo "==> Creating /srv/saas layout"
install -d -m 755 /srv/saas
install -d -m 755 /srv/saas/tenants
install -d -m 700 /srv/saas/traefik
install -d -m 755 /srv/saas/postgres/data
install -d -m 755 /srv/saas/controlplane/data
install -d -m 755 /srv/saas/backups
install -d -m 755 /srv/saas/backups/restic
install -d -m 755 /srv/saas/backups/deleted
install -d -m 755 /srv/saas/opencrm/data

if [[ ! -f /srv/saas/traefik/acme.json ]]; then
  echo "==> Creating acme.json (chmod 600)"
  install -m 600 /dev/null /srv/saas/traefik/acme.json
fi

if [[ ! -f "$REPO_DIR/.env" ]]; then
  echo "==> Copying .env.example -> .env (EDIT IT before continuing)"
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  echo "Edit $REPO_DIR/.env and re-run this script."
  exit 1
fi

echo "==> Pulling images and building controlplane"
docker compose -f docker/saas/docker-compose.yml --env-file .env pull
docker compose -f docker/saas/docker-compose.yml --env-file .env build controlplane

echo "==> Starting stack"
docker compose -f docker/saas/docker-compose.yml --env-file .env up -d

echo
echo "==> Done. Next steps:"
echo "   1. Wait ~1 minute for Traefik to obtain wildcard cert (check: docker logs traefik)"
echo "   2. Bootstrap first admin:"
echo "      docker compose -f docker/saas/docker-compose.yml exec controlplane /usr/local/bin/picoclaw-tenantctl bootstrap-admin --email you@example.com --password 'changeme'"
echo "   3. Open https://admin.<your-domain>/"
