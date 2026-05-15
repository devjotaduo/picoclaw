#!/usr/bin/env bash
# Reload .env into running containers.
#
# `docker restart` keeps the env from the original `create` — so editing .env
# and restarting LEAVES THE OLD VALUES inside the container. This script
# force-recreates the services that interpolate ${VARS} from .env so the new
# values actually land.
#
# Usage:
#   docker/saas/scripts/reload-env.sh                # litellm + controlplane (default)
#   docker/saas/scripts/reload-env.sh all            # every env-reading service
#   docker/saas/scripts/reload-env.sh litellm        # just one
#   docker/saas/scripts/reload-env.sh litellm traefik

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_DIR="$REPO_DIR/deploy"

if [[ ! -f "$REPO_DIR/.env" ]]; then
  echo "error: $REPO_DIR/.env not found" >&2
  exit 1
fi

# Services that interpolate vars from .env. Postgres is left out on purpose —
# rotating its credentials needs a coordinated migration, not a container recreate.
ALL_SERVICES=(traefik litellm opencrm controlplane)
DEFAULT_SERVICES=(litellm controlplane)

if [[ $# -eq 0 ]]; then
  SERVICES=("${DEFAULT_SERVICES[@]}")
elif [[ "$1" == "all" ]]; then
  SERVICES=("${ALL_SERVICES[@]}")
elif [[ "$1" == "-h" || "$1" == "--help" ]]; then
  sed -n '2,16p' "$0"
  exit 0
else
  SERVICES=("$@")
fi

COMPOSE_ARGS=(--env-file "$REPO_DIR/.env" -f "$DEPLOY_DIR/docker-compose.yml")
if [[ -f "$DEPLOY_DIR/docker-compose.1panel.yml" ]]; then
  COMPOSE_ARGS+=(-f "$DEPLOY_DIR/docker-compose.1panel.yml")
fi

cd "$REPO_DIR"
echo "==> recreating: ${SERVICES[*]}"
docker compose "${COMPOSE_ARGS[@]}" up -d --force-recreate --no-deps "${SERVICES[@]}"

echo
echo "==> status:"
docker compose "${COMPOSE_ARGS[@]}" ps "${SERVICES[@]}"
