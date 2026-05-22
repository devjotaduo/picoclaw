#!/usr/bin/env bash
#
# Weekly housekeeping for the SaaS VPS.
#
# Triggered by picoclaw-cleanup.timer every Sunday at 04:00 UTC. Runs
# only conservative, low-risk prunes — anything that could destroy a
# rollback target is gated behind a 7-day retention filter.
#
# What gets pruned:
#   - Dangling (untagged) images older than 7 days
#   - Docker build cache entries older than 7 days
#   - Stopped containers (we expect zero, but defensive)
#   - Unused networks (none today, but defensive)
#
# What is NEVER pruned:
#   - Tagged images (would break compose recreates / rollback)
#   - Volumes (customer data lives there)
#   - Running containers
#   - The deliberately-kept rollback image `b51b04848dd9` — only pruned
#     after 7 days, by which point the auto-deploy timer has confirmed
#     several successful CI builds.
#
# All output goes to journald — view with:
#   journalctl -u picoclaw-cleanup.service -n 200 --no-pager

set -euo pipefail

RETENTION="${PICOCLAW_CLEANUP_RETENTION:-168h}"  # 7 days
LOCKFILE="${PICOCLAW_CLEANUP_LOCK:-/var/run/picoclaw-cleanup.lock}"

log() { echo "[picoclaw-cleanup $(date -Iseconds)] $*"; }

exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "another cleanup is already running, skipping"
  exit 0
fi

log "=== cleanup pass starting (retention=$RETENTION) ==="

# ── Pre snapshot ──────────────────────────────────────────────
log "-- disk before --"
df -h / | awk 'NR==1 || /\/$/'
log "-- docker before --"
docker system df

# ── Prune steps ───────────────────────────────────────────────
log "-- pruning dangling images older than $RETENTION --"
docker image prune -f --filter "until=$RETENTION" 2>&1 | sed 's/^/  /'

log "-- pruning build cache older than $RETENTION --"
docker builder prune -f --filter "until=$RETENTION" 2>&1 | sed 's/^/  /'

log "-- pruning stopped containers --"
docker container prune -f 2>&1 | sed 's/^/  /'

log "-- pruning unused networks --"
docker network prune -f 2>&1 | sed 's/^/  /'

# ── Post snapshot ─────────────────────────────────────────────
log "-- disk after --"
df -h / | awk 'NR==1 || /\/$/'
log "-- docker after --"
docker system df

# ── Soft alarm if disk is still tight ─────────────────────────
USE_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "${USE_PCT:-0}" -ge 70 ]; then
  log "WARN: disk usage at ${USE_PCT}% after cleanup — investigate /srv, /var/lib/docker"
fi

log "=== cleanup pass complete ==="
