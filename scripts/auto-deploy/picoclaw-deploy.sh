#!/usr/bin/env bash
#
# Picoclaw auto-deploy: pull the latest prebuilt SaaS images from GHCR and,
# if any central service differs from the running container, recreate only
# that service.
#
# Triggered by picoclaw-deploy.timer every 2 minutes. Tenant containers
# (tenant-<id>) are NEVER touched here — they hold live customer state.
#
# How it knows when to act:
#   1. `docker pull` the rolling tags (GHCR HEADs the manifests; if unchanged
#      these are cheap no-ops).
#   2. Retag remote images to the local tags used by production compose.
#   3. Compare local image IDs against each running central container.
#   4. If they differ, `docker compose up -d --no-deps <service>`.
#
# Why not just `docker compose pull && up -d` unconditionally? Because
# `up -d` re-runs healthcheck startup and briefly takes the controlplane
# out of rotation. Doing it only when the image actually changed keeps
# the journal clean and prod stable.

set -euo pipefail

CONTROLPLANE_IMAGE="${PICOCLAW_DEPLOY_IMAGE:-${PICOCLAW_CONTROLPLANE_SOURCE_IMAGE:-ghcr.io/devjotaduo/picoclaw-saas:main}}"
CONTROLPLANE_LOCAL_TAG="${PICOCLAW_DEPLOY_LOCAL_TAG:-${PICOCLAW_CONTROLPLANE_LOCAL_TAG:-picoclaw/saas:latest}}"
LAUNCHER_IMAGE="${PICOCLAW_LAUNCHER_SOURCE_IMAGE:-ghcr.io/devjotaduo/picoclaw-launcher:main}"
LAUNCHER_LOCAL_TAG="${PICOCLAW_LAUNCHER_IMAGE:-picoclaw-launcher:latest}"
BROWSER_IMAGE="${PICOCLAW_BROWSER_SIDECAR_SOURCE_IMAGE:-ghcr.io/devjotaduo/picoclaw-browser-sidecar:main}"
BROWSER_LOCAL_TAG="${PICOCLAW_BROWSER_SIDECAR_IMAGE:-picoclaw/browser-sidecar:latest}"
OPENCRM_IMAGE="${PICOCLAW_OPENCRM_SOURCE_IMAGE:-ghcr.io/devjotaduo/picoclaw-opencrm:main}"
OPENCRM_LOCAL_TAG="${PICOCLAW_OPENCRM_IMAGE:-picoclaw/opencrm:latest}"

DEFAULT_COMPOSE_FILE="/srv/saas/picoclaw/docker/saas/docker-compose.prod.yml"
LEGACY_COMPOSE_FILE="/srv/saas/picoclaw/docker/saas/docker-compose.yml"
COMPOSE_FILE="${PICOCLAW_COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}"
COMPOSE_PROJECT="${PICOCLAW_COMPOSE_PROJECT:-picoclaw-saas}"
# IMPORTANT: the live VPS keeps .env at the repo root, NOT next to the
# compose file. Without --env-file the compose run substitutes every
# ${JWT_SECRET}, ${POSTGRES_PASSWORD}, ${SAAS_BASE_DOMAIN}, etc. with
# empty strings and the controlplane crashloops on "JWT_SECRET is required".
# Learned the hard way on 2026-05-21 — kept here so it doesn't happen again.
ENV_FILE="${PICOCLAW_ENV_FILE:-/srv/saas/picoclaw/.env}"
CONTAINER="${PICOCLAW_CONTAINER:-controlplane}"
CONTROLPLANE_SERVICE="${PICOCLAW_CONTROLPLANE_SERVICE:-controlplane}"
LOCKFILE="${PICOCLAW_DEPLOY_LOCK:-/var/run/picoclaw-deploy.lock}"

log() { echo "[picoclaw-deploy $(date -Iseconds)] $*"; }

if [ ! -f "$COMPOSE_FILE" ] && [ -z "${PICOCLAW_COMPOSE_FILE:-}" ] && [ -f "$LEGACY_COMPOSE_FILE" ]; then
  log "WARN: production compose not found at $DEFAULT_COMPOSE_FILE; falling back to legacy compose"
  COMPOSE_FILE="$LEGACY_COMPOSE_FILE"
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  log "ERROR: compose file not found at $COMPOSE_FILE"
  log "       install docker/saas/docker-compose.prod.yml or override PICOCLAW_COMPOSE_FILE"
  exit 1
fi

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

pull_and_tag() {
  remote="$1"
  local_tag="$2"
  label="$3"

  if ! docker pull --quiet "$remote" >/dev/null; then
    log "ERROR: docker pull $remote failed — check ghcr.io auth or network"
    exit 1
  fi
  docker tag "$remote" "$local_tag"
  log "pulled $label image -> $local_tag"
}

image_id() {
  docker image inspect "$1" --format '{{.Id}}'
}

container_image_id() {
  docker inspect "$1" --format '{{.Image}}' 2>/dev/null || true
}

short_id() {
  sed 's/^sha256://' | sed 's/^\(.\{12\}\).*/\1.../'
}

compose_up_service() {
  service="$1"
  if ! docker compose -p "$COMPOSE_PROJECT" \
                      -f "$COMPOSE_FILE" \
                      --env-file "$ENV_FILE" \
                      up -d --no-deps "$service"; then
    log "ERROR: docker compose up -d $service failed"
    exit 1
  fi
}

recreate_if_changed() {
  service="$1"
  container="$2"
  local_tag="$3"
  label="$4"

  new_image_id="$(image_id "$local_tag")"
  running_image_id="$(container_image_id "$container")"

  if [ -z "$running_image_id" ]; then
    log "$container is not running; starting $service"
    compose_up_service "$service"
    return
  fi

  if [ "$running_image_id" = "$new_image_id" ]; then
    return
  fi

  log "$label image changed:"
  log "  running $(printf '%s' "$running_image_id" | short_id)"
  log "  pulled  $(printf '%s' "$new_image_id" | short_id)"
  log "recreating $service via docker compose"
  compose_up_service "$service"
}

pull_and_tag "$CONTROLPLANE_IMAGE" "$CONTROLPLANE_LOCAL_TAG" "controlplane"
pull_and_tag "$LAUNCHER_IMAGE" "$LAUNCHER_LOCAL_TAG" "launcher"
pull_and_tag "$BROWSER_IMAGE" "$BROWSER_LOCAL_TAG" "browser-sidecar"
pull_and_tag "$OPENCRM_IMAGE" "$OPENCRM_LOCAL_TAG" "opencrm"

recreate_if_changed "browser-sidecar" "browser-sidecar" "$BROWSER_LOCAL_TAG" "browser-sidecar"
recreate_if_changed "opencrm" "opencrm" "$OPENCRM_LOCAL_TAG" "opencrm"
recreate_if_changed "$CONTROLPLANE_SERVICE" "$CONTAINER" "$CONTROLPLANE_LOCAL_TAG" "controlplane"

# Give the healthcheck a moment, then report. We DON'T fail the deploy on
# a still-starting health state — the timer's next tick won't re-deploy
# (image ID matches now) so the recreation is settled regardless.
sleep 5
HEALTH=$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
STATUS=$(docker inspect "$CONTAINER" --format '{{.State.Status}}'         2>/dev/null || echo "unknown")
log "deploy complete — status=$STATUS health=$HEALTH"
log "tenant image available locally as $LAUNCHER_LOCAL_TAG; tenant containers are not auto-recreated"
