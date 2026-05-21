#!/usr/bin/env bash
#
# Picoclaw auto-deploy script.
#
# Triggered by picoclaw-deploy.timer every 2 minutes. Pulls origin/main into
# /root/picoclaw, then restarts ONLY the components whose source actually
# changed:
#
#   - Any `.go`, go.mod, go.sum  -> systemctl restart picoclaw-main-dev.service
#   - cmd/picoclaw-saas/, internal/saas/, web/saas-admin/ -> make saas-dev-controlplane
#   - Frontend-only changes (web/frontend/**) -> nothing (Vite hot-reloads)
#
# Tenant containers (tenant-<id>) are NOT touched by this script. Their
# updates are intentional, customer-facing actions — push them via the
# admin dashboard's "rebuild tenant" flow when you mean it.

set -euo pipefail

REPO="${PICOCLAW_DEPLOY_REPO:-/root/picoclaw}"
LOCKFILE="${PICOCLAW_DEPLOY_LOCK:-/var/run/picoclaw-deploy.lock}"
BRANCH="${PICOCLAW_DEPLOY_BRANCH:-main}"

log() { echo "[picoclaw-deploy $(date -Iseconds)] $*"; }

# Prevent overlapping runs. If a previous deploy is still working (e.g. a
# slow `make saas-dev-controlplane` rebuild), just skip this tick.
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "another deploy is in progress, skipping"
  exit 0
fi

cd "$REPO"

# Fail fast if working tree has unexpected local mods. The deploy path
# expects a clean checkout — if someone edited files in-place on the box,
# bail loudly instead of clobbering their work with `git reset --hard`.
if ! git diff --quiet HEAD || ! git diff --cached --quiet; then
  log "ERROR: dirty working tree at $REPO; refusing to overwrite. Inspect with: cd $REPO && git status"
  exit 1
fi

git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  # Nothing to do. Stay silent so journalctl isn't flooded every 2 min.
  exit 0
fi

log "deploying $LOCAL -> $REMOTE"

# Compute changeset BEFORE moving HEAD so we know what to restart.
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
log "changed paths:"
echo "$CHANGED" | sed 's/^/  /' | tee -a /dev/stderr >/dev/null

git reset --hard "$REMOTE"

RESTART_HOST=0
RESYNC_CTRLPLANE=0

if echo "$CHANGED" | grep -qE '(\.go$|^go\.mod$|^go\.sum$)'; then
  RESTART_HOST=1
fi

if echo "$CHANGED" | grep -qE '^(cmd/picoclaw-saas/|internal/saas/|web/saas-admin/)'; then
  RESYNC_CTRLPLANE=1
fi

# Frontend hot-reloads via Vite (the dev:api process watches the tree).
# We log it just so the journal shows we noticed.
if echo "$CHANGED" | grep -qE '^web/frontend/'; then
  log "frontend changes detected — relying on Vite hot reload, no restart"
fi

if [ "$RESTART_HOST" -eq 1 ]; then
  log "restarting picoclaw-main-dev.service (Go change)"
  systemctl restart picoclaw-main-dev.service
fi

if [ "$RESYNC_CTRLPLANE" -eq 1 ]; then
  log "re-syncing controlplane container (saas/* change)"
  # `make saas-dev-controlplane` builds the launcher binary locally and
  # copies it into the running controlplane container without rebuilding
  # the image. See docs/operations/saas-dev-mode.md.
  if ! make saas-dev-controlplane; then
    log "ERROR: make saas-dev-controlplane failed — controlplane may be running old binary"
    exit 1
  fi
fi

log "deploy complete"
