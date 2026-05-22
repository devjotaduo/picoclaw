#!/usr/bin/env bash
#
# Picoclaw auto-deploy: pull the latest controlplane image from GHCR and,
# if it differs from the running container, recreate that container.
#
# Triggered by picoclaw-deploy.timer every 2 minutes. Tenant containers
# (tenant-<id>) are NEVER touched here — they hold live customer state.
#
# How it knows when to act:
#   1. `docker pull` the rolling tag (GHCR HEADs the manifest; if unchanged
#      it's a cheap no-op).
#   2. Compare the image ID Docker would launch (`docker inspect <tag>`)
#      against what the running controlplane is actually using.
#   3. If they differ, `docker compose up -d --no-deps controlplane`.
#
# Why not just `docker compose pull && up -d` unconditionally? Because
# `up -d` re-runs healthcheck startup and briefly takes the controlplane
# out of rotation. Doing it only when the image actually changed keeps
# the journal clean and prod stable.

set -euo pipefail

IMAGE="${PICOCLAW_DEPLOY_IMAGE:-ghcr.io/devjotaduo/picoclaw-saas:main}"
LOCAL_TAG="${PICOCLAW_DEPLOY_LOCAL_TAG:-picoclaw/saas:latest}"
COMPOSE_FILE="${PICOCLAW_COMPOSE_FILE:-/srv/saas/picoclaw/docker/saas/docker-compose.yml}"
COMPOSE_PROJECT="${PICOCLAW_COMPOSE_PROJECT:-picoclaw-saas}"
# IMPORTANT: the live VPS keeps .env at the repo root, NOT next to the
# compose file. Without --env-file the compose run substitutes every
# ${JWT_SECRET}, ${POSTGRES_PASSWORD}, ${SAAS_BASE_DOMAIN}, etc. with
# empty strings and the controlplane crashloops on "JWT_SECRET is required".
# Learned the hard way on 2026-05-21 — kept here so it doesn't happen again.
ENV_FILE="${PICOCLAW_ENV_FILE:-/srv/saas/picoclaw/.env}"
CONTAINER="${PICOCLAW_CONTAINER:-controlplane}"
LOCKFILE="${PICOCLAW_DEPLOY_LOCK:-/var/run/picoclaw-deploy.lock}"

log() { echo "[picoclaw-deploy $(date -Iseconds)] $*"; }

# Refuse to run if the env file is missing — recreating the controlplane
# without it nukes JWT_SECRET / POSTGRES_PASSWORD / SAAS_BASE_DOMAIN and
# crashloops the container. Fail loudly instead.
if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: env file not found at $ENV_FILE — refusing to deploy"
  log "       (override with PICOCLAW_ENV_FILE env var if it lives elsewhere)"
  exit 1
fi

# Prevent overlapping runs (slow pull on a flaky network + 2-min timer).
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "another deploy is in progress, skipping"
  exit 0
fi

# Pull the rolling tag. Cheap when nothing changed (manifest HEAD only).
if ! docker pull --quiet "$IMAGE" >/dev/null; then
  log "ERROR: docker pull $IMAGE failed — check ghcr.io auth or network"
  exit 1
fi

# Retag locally so the existing compose file (which references
# picoclaw/saas:latest) finds it without compose-file edits.
docker tag "$IMAGE" "$LOCAL_TAG"

NEW_IMAGE_ID=$(docker image inspect "$LOCAL_TAG" --format '{{.Id}}')

# What's the running container actually based on?
RUNNING_IMAGE_ID=$(docker inspect "$CONTAINER" --format '{{.Image}}' 2>/dev/null || echo "")

if [ -z "$RUNNING_IMAGE_ID" ]; then
  log "container '$CONTAINER' is not running; starting it"
elif [ "$RUNNING_IMAGE_ID" = "$NEW_IMAGE_ID" ]; then
  # Silent no-op so the journal stays readable.
  exit 0
else
  log "controlplane image changed:"
  log "  running ${RUNNING_IMAGE_ID#sha256:}" | sed 's/\(running .\{12\}\).*/\1.../'
  log "  pulled  ${NEW_IMAGE_ID#sha256:}"     | sed 's/\(pulled  .\{12\}\).*/\1.../'
fi

log "recreating $CONTAINER via docker compose"

# --no-deps: don't touch other services (postgres, traefik, litellm, ...).
# --env-file: see comment on ENV_FILE above. Without this, every
# `${VAR}` in the compose file resolves to empty string at recreate time
# and the controlplane crashloops on missing secrets.
# Only the controlplane container is replaced.
if ! docker compose -p "$COMPOSE_PROJECT" \
                    -f "$COMPOSE_FILE" \
                    --env-file "$ENV_FILE" \
                    up -d --no-deps "$CONTAINER"; then
  log "ERROR: docker compose up -d $CONTAINER failed"
  exit 1
fi

# Ensure peer services that controlplane benefits from but doesn't bring
# up itself (due to --no-deps above) are running. These services have
# restart: unless-stopped in compose, so once started they survive
# reboots — this block only matters on a cold host or after an explicit
# `docker compose down`. `up -d` is a no-op when the container is
# already running with the same image, so safe to call every cycle.
for peer in browser-sidecar; do
  if ! docker inspect "$peer" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    log "peer service $peer not running — bringing it up"
    if ! docker compose -p "$COMPOSE_PROJECT" \
                        -f "$COMPOSE_FILE" \
                        --env-file "$ENV_FILE" \
                        up -d --no-deps "$peer"; then
      log "WARN: failed to start $peer (continuing — tenants without it lose browser tooling only)"
    fi
  fi
done

# Give the healthcheck a moment, then report. We DON'T fail the deploy on
# a still-starting health state — the timer's next tick won't re-deploy
# (image ID matches now) so the recreation is settled regardless.
sleep 5
HEALTH=$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
STATUS=$(docker inspect "$CONTAINER" --format '{{.State.Status}}'         2>/dev/null || echo "unknown")
log "deploy complete — status=$STATUS health=$HEALTH"
