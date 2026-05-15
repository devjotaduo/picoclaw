#!/usr/bin/env bash
# restic-based incremental backup of all stateful directories.
# Schedule via cron: 0 3 * * * /srv/saas/picoclaw-saas/docker/saas/scripts/backup.sh
set -euo pipefail

export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/srv/saas/backups/restic}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/srv/saas/backups/.restic-pass}"

if [[ ! -d "$RESTIC_REPOSITORY/keys" ]]; then
  echo "==> Initializing restic repo at $RESTIC_REPOSITORY"
  restic init
fi

echo "==> pg_dump"
docker exec postgres pg_dump -U "${POSTGRES_USER:-picoclaw-saas}" -Fc "${POSTGRES_DB_CONTROL:-controlplane}" \
  > /srv/saas/backups/pg-controlplane-$(date +%F-%H%M).dump
docker exec postgres pg_dump -U "${POSTGRES_USER:-picoclaw-saas}" -Fc "${POSTGRES_DB_LITELLM:-litellm}" \
  > /srv/saas/backups/pg-litellm-$(date +%F-%H%M).dump

# Keep only last 14 pg_dumps
find /srv/saas/backups -maxdepth 1 -name 'pg-*.dump' -mtime +14 -delete

echo "==> restic backup"
restic backup \
  /srv/saas/tenants \
  /srv/saas/traefik/acme.json \
  /srv/saas/controlplane/data \
  /srv/saas/opencrm/data \
  /srv/saas/backups/pg-*.dump

echo "==> restic forget --prune"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

echo "==> restic check (random subset)"
restic check --read-data-subset=2%
