#!/usr/bin/env bash
# Restore a single tenant volume from the latest restic snapshot.
# Usage: restore.sh <tenant_id>
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <tenant_id>" >&2
  exit 1
fi

TENANT_ID="$1"
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/srv/saas/backups/restic}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/srv/saas/backups/.restic-pass}"

if ! docker inspect "tenant-$TENANT_ID" >/dev/null 2>&1; then
  echo "Container tenant-$TENANT_ID not found; restore will only recover the volume."
else
  echo "==> Stopping tenant-$TENANT_ID"
  docker stop "tenant-$TENANT_ID" || true
fi

echo "==> Restoring /srv/saas/tenants/$TENANT_ID from latest snapshot"
restic restore latest --target / --include "/srv/saas/tenants/$TENANT_ID"

if docker inspect "tenant-$TENANT_ID" >/dev/null 2>&1; then
  echo "==> Starting tenant-$TENANT_ID"
  docker start "tenant-$TENANT_ID"
fi

echo "==> Done. Verify the tenant is healthy."
