#!/usr/bin/env bash
#
# Daily encrypted backup of tenant workspace data to Cloudflare R2 using
# restic. Triggered by picoclaw-r2-backup.timer at 03:00 BRT (06:00 UTC).
#
# Why restic over plain tar.gz + rclone:
#   - Content-addressable dedup: 30 daily snapshots cost roughly 1 full
#     backup + per-day deltas, not 30x the tenant size.
#   - Client-side encryption (AES-256) — R2 only sees opaque blobs.
#   - Atomic snapshots: a snapshot either exists in full or doesn't.
#   - Point-in-time restore via snapshot ID.
#
# Restore example (you'll thank me later):
#   set -a; source /etc/picoclaw/r2-backup.env; set +a
#   export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}"
#   export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
#   export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
#   restic snapshots
#   restic restore <snapshot-id> --target /tmp/restore --path /srv/saas/tenants/<tenant-id>

set -euo pipefail

ENV_FILE="${PICOCLAW_R2_ENV_FILE:-/etc/picoclaw/r2-backup.env}"
BACKUP_PATH="${PICOCLAW_BACKUP_PATH:-/srv/saas/tenants}"
LOCKFILE="${PICOCLAW_BACKUP_LOCK:-/var/run/picoclaw-r2-backup.lock}"
HOST_TAG="${PICOCLAW_BACKUP_HOST:-$(hostname -s)}"

log() { echo "[r2-backup $(date -Iseconds)] $*"; }

if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: env file $ENV_FILE missing — see docs/operations/tenant-backups.md"
  exit 1
fi

# Load creds + passphrase from secrets file (chmod 600, root only).
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID not set in $ENV_FILE}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY not set in $ENV_FILE}"
: "${R2_ENDPOINT:?R2_ENDPOINT not set in $ENV_FILE (expect https://<account>.r2.cloudflarestorage.com)}"
: "${R2_BUCKET:?R2_BUCKET not set in $ENV_FILE}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD not set in $ENV_FILE — LOSING IT MAKES BACKUPS UNREADABLE}"

if ! command -v restic >/dev/null 2>&1; then
  log "ERROR: restic binary missing (apt install restic)"
  exit 1
fi

if [ ! -d "$BACKUP_PATH" ]; then
  log "ERROR: backup path $BACKUP_PATH does not exist on this host"
  exit 1
fi

# restic talks to S3-compatible API; R2 fits.
export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RESTIC_PASSWORD

exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "another backup is in progress, skipping"
  exit 0
fi

log "=== backup pass starting (target=$BACKUP_PATH host=$HOST_TAG) ==="

# Lazy repo init — first run on a fresh bucket has to call `restic init`.
# Subsequent calls fast-path through and just write a snapshot.
if ! restic snapshots --no-lock --quiet >/dev/null 2>&1; then
  log "repository not initialized yet; running restic init"
  if ! restic init; then
    log "ERROR: restic init failed — check R2 creds, endpoint, bucket name"
    exit 1
  fi
fi

# Backup. Excludes are conservative: drop transient state that can be
# rebuilt (sessions/.tmp, WhatsApp store WALs that get rolled by sqlite,
# lock files, journal/shm) but KEEP the main *.db files themselves.
log "--- backing up $BACKUP_PATH ---"
if ! restic backup "$BACKUP_PATH" \
    --tag daily \
    --tag "host:$HOST_TAG" \
    --host "$HOST_TAG" \
    --exclude '*.tmp' \
    --exclude '*.lock' \
    --exclude '*-journal' \
    --exclude '*-wal' \
    --exclude '*-shm' \
    --exclude '*.pid' \
    --exclude '*.sock' \
    --exclude '.cache' \
    --exclude 'runtime-user-env'; then
  log "ERROR: restic backup failed"
  exit 1
fi

# Retention policy. Keep enough history to ride out a couple of bad weeks
# of corruption, but cap growth on the free tier:
#   - last 7 daily snapshots
#   - last 4 weekly snapshots
#   - last 6 monthly snapshots
# `--prune` reclaims storage from pack files no longer referenced.
log "--- applying retention policy ---"
if ! restic forget \
    --keep-daily 7 \
    --keep-weekly 4 \
    --keep-monthly 6 \
    --host "$HOST_TAG" \
    --prune; then
  log "WARN: restic forget/prune failed — backup itself was OK, retention next pass"
fi

# Light integrity check (10% of data, ~30s on a small repo). The full
# `restic check --read-data` runs only weekly to save bandwidth.
log "--- integrity sample check (subset) ---"
if ! restic check --read-data-subset=10%; then
  log "WARN: integrity check found issues — investigate with `restic check`"
fi

# Report repo size after retention. Free tier is 10 GB; alarm at 8.
SIZE_BYTES=$(restic stats --mode raw-data --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("total_size", 0))' 2>/dev/null || echo 0)
SIZE_MB=$(( SIZE_BYTES / 1024 / 1024 ))
log "repo raw-data size: ${SIZE_MB} MB"
if [ "$SIZE_MB" -gt 8192 ]; then
  log "WARN: repo ${SIZE_MB} MB is approaching the 10 GB free tier ceiling on R2"
fi

log "=== backup pass complete ==="
