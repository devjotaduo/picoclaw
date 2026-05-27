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
# Space-separated list of host paths included in each snapshot.
# Default: tenant volumes + operator config tree (/etc/picoclaw holds
# r2-backup.env + claude-auth/) + Postgres dump staging dir. Losing
# /srv/saas/postgres/data/ is recoverable from the .sql.gz dumps in
# the staging dir (audit P0 #3, 2026-05-27).
BACKUP_PATHS="${PICOCLAW_BACKUP_PATHS:-/srv/saas/tenants /etc/picoclaw /var/lib/picoclaw-pg-dumps}"
# Legacy single-path env still honored: older deploys may set
# PICOCLAW_BACKUP_PATH to a single dir; preserve that override.
LEGACY_BACKUP_PATH="${PICOCLAW_BACKUP_PATH:-}"
if [ -n "$LEGACY_BACKUP_PATH" ]; then
  BACKUP_PATHS="$LEGACY_BACKUP_PATH"
fi
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

# Postgres backup config (audit P0 #3). Resolved AFTER the env-file source
# so PICOCLAW_PG_* keys in /etc/picoclaw/r2-backup.env actually win. Default
# user is `picoclaw` (matches POSTGRES_USER in docker/saas/.env on this fleet);
# operators with a non-standard role set PICOCLAW_PG_USER in the env file.
# Where pg_dumpall writes the daily dump before restic snapshots it. We keep
# the last 2 on disk (not 1) so a corrupt run still has a previous good copy.
PG_DUMP_DIR="${PICOCLAW_PG_DUMP_DIR:-/var/lib/picoclaw-pg-dumps}"
PG_CONTAINER="${PICOCLAW_PG_CONTAINER:-postgres}"
PG_USER="${PICOCLAW_PG_USER:-picoclaw}"

: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID not set in $ENV_FILE}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY not set in $ENV_FILE}"
: "${R2_ENDPOINT:?R2_ENDPOINT not set in $ENV_FILE (expect https://<account>.r2.cloudflarestorage.com)}"
: "${R2_BUCKET:?R2_BUCKET not set in $ENV_FILE}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD not set in $ENV_FILE — LOSING IT MAKES BACKUPS UNREADABLE}"

if ! command -v restic >/dev/null 2>&1; then
  log "ERROR: restic binary missing (apt install restic)"
  exit 1
fi

# Pre-flight: every BACKUP_PATH must exist EXCEPT the pg-dumps staging dir,
# which the pg_dumpall step above creates lazily. If pg_dumpall ran but
# wrote zero files, restic still snapshots the empty dir cleanly.
for path in $BACKUP_PATHS; do
  if [ "$path" = "$PG_DUMP_DIR" ]; then
    mkdir -p "$path"
    continue
  fi
  if [ ! -e "$path" ]; then
    log "ERROR: backup path $path does not exist on this host"
    exit 1
  fi
done

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

# Cleanup-on-exit trap (Sprint 1 followup, 2026-05-27): a prior run
# that died mid-flight leaves a restic-side lock on the R2 repo,
# which blocks retention + check on every subsequent run until manual
# `restic unlock`. The local flock above handles "two scripts at once"
# but not "previous script crashed". `restic unlock` only removes
# stale locks owned by THIS host (safe to run unconditionally).
# || true so a transient R2 hiccup at cleanup doesn't taint the exit
# code of an otherwise-successful backup.
cleanup_restic_lock() {
  restic unlock --quiet 2>/dev/null || true
}
trap cleanup_restic_lock EXIT

log "=== backup pass starting (paths=$BACKUP_PATHS host=$HOST_TAG) ==="

# ── Postgres dump (audit P0 #3) ──────────────────────────────────────
# pg_dumpall writes a logical dump containing roles + all databases.
# Restic dedups the gzipped output across snapshots, so storage cost is
# small. Skipped if docker or the postgres container isn't present
# (e.g. local dev box) — the restic step still runs over /srv/saas/tenants
# and /etc/picoclaw. Failure of pg_dump aborts the whole pass: losing
# postgres without noticing is the bug this P0 fixes.
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  mkdir -p "$PG_DUMP_DIR"
  chmod 0700 "$PG_DUMP_DIR"
  PG_DUMP_FILE="$PG_DUMP_DIR/pg_dumpall-$(date +%Y%m%dT%H%M%S).sql.gz"
  log "--- dumping postgres → $PG_DUMP_FILE ---"
  if ! docker exec "$PG_CONTAINER" pg_dumpall -U "$PG_USER" --clean --if-exists \
       | gzip -9 > "$PG_DUMP_FILE.partial"; then
    log "ERROR: pg_dumpall failed — aborting backup pass"
    rm -f "$PG_DUMP_FILE.partial"
    exit 1
  fi
  mv "$PG_DUMP_FILE.partial" "$PG_DUMP_FILE"
  # Keep last 2 dumps on disk; restic snapshots are the long-term history.
  # shellcheck disable=SC2012
  ls -1t "$PG_DUMP_DIR"/pg_dumpall-*.sql.gz 2>/dev/null \
    | tail -n +3 | xargs -r rm -f --
  DUMP_SIZE_MB=$(( $(stat -c%s "$PG_DUMP_FILE" 2>/dev/null || echo 0) / 1024 / 1024 ))
  log "pg_dumpall complete: ${DUMP_SIZE_MB} MB on disk"
else
  log "WARN: postgres container '$PG_CONTAINER' not running — skipping pg_dumpall"
fi

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
# Multiple paths are passed as separate args to restic (it accepts N).
log "--- backing up $BACKUP_PATHS ---"
# shellcheck disable=SC2086 # BACKUP_PATHS is intentionally word-split
if ! restic backup $BACKUP_PATHS \
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

# Heartbeat file written at successful end of every pass. External
# monitoring (Uptime Robot HTTP check on a tiny sidecar, or a cron
# elsewhere that SSHs in and stats this file's mtime) can alert when
# the file goes stale (> 26h means yesterday's daily backup didn't
# run — could be timer disabled, postgres down, R2 outage, etc.).
# Sprint 1 followup, 2026-05-27: the timer was silently disabled
# between 23/05 and 27/05 with no alarm because nothing watched the
# timer state. This file is the watchable artifact.
HEARTBEAT_FILE="${PICOCLAW_BACKUP_HEARTBEAT:-/var/lib/picoclaw-pg-dumps/.last-backup-ok}"
mkdir -p "$(dirname "$HEARTBEAT_FILE")"
echo "$(date -Iseconds) snapshot_size_mb=${SIZE_MB}" > "$HEARTBEAT_FILE"
chmod 0644 "$HEARTBEAT_FILE"
