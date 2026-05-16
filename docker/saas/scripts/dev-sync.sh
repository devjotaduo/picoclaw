#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage:
  docker/saas/scripts/dev-sync.sh <controlplane|tenants|all> [tenant-id-or-container ...] [options]

Fast SaaS dev loop: compile local Go binaries and copy them into running
containers. This avoids rebuilding Docker images for most backend changes.

Targets:
  controlplane        sync picoclaw-saas and picoclaw-tenantctl into controlplane
  tenants            sync picoclaw and picoclaw-launcher into tenant containers
  all                sync controlplane and all tenant containers

Options:
  --admin-ui          rebuild web/saas-admin/dist before building controlplane
  --tenant-ui         rebuild web/frontend -> web/backend/dist before building tenants
  --skip-build        copy existing build/dev binaries only
  --no-restart        copy binaries without restarting containers
  -h, --help          show this help

Environment:
  GO_BUILD_TAGS       default: goolm,stdjson,whatsapp_native
  CONTROLPLANE_CONTAINER default: controlplane
  PICOCLAW_DEV_BUILD_DIR default: <repo>/build/dev

Examples:
  docker/saas/scripts/dev-sync.sh tenants demo-f844dc
  docker/saas/scripts/dev-sync.sh controlplane
  docker/saas/scripts/dev-sync.sh all --tenant-ui --admin-ui
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

log() {
  printf '==> %s\n' "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$script_dir/../../.." && pwd
}

target="${1:-}"
if [[ -z "$target" || "$target" == "-h" || "$target" == "--help" ]]; then
  usage
  exit 0
fi
shift

case "$target" in
  controlplane|cp) target="controlplane" ;;
  tenant|tenants) target="tenants" ;;
  all) target="all" ;;
  *) die "unknown target: $target" ;;
esac

admin_ui=0
tenant_ui=0
skip_build=0
restart_containers=1
tenant_args=()

while (($#)); do
  case "$1" in
    --admin-ui)
      admin_ui=1
      ;;
    --tenant-ui)
      tenant_ui=1
      ;;
    --skip-build)
      skip_build=1
      ;;
    --no-restart)
      restart_containers=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while (($#)); do
        tenant_args+=("$1")
        shift
      done
      break
      ;;
    -*)
      die "unknown option: $1"
      ;;
    *)
      tenant_args+=("$1")
      ;;
  esac
  shift
done

ROOT="$(repo_root)"
BUILD_DIR="${PICOCLAW_DEV_BUILD_DIR:-$ROOT/build/dev}"
GO_BUILD_TAGS="${GO_BUILD_TAGS:-goolm,stdjson,whatsapp_native}"
CONTROLPLANE_CONTAINER="${CONTROLPLANE_CONTAINER:-controlplane}"

export CGO_ENABLED="${CGO_ENABLED:-0}"
export GOCACHE="${GOCACHE:-$ROOT/.cache/go-build}"
export GOMODCACHE="${GOMODCACHE:-$ROOT/.cache/go-mod}"
export GOTOOLCHAIN="${GOTOOLCHAIN:-local}"

CONFIG_PKG="github.com/sipeed/picoclaw/pkg/config"
VERSION="$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || echo dev)"
GIT_COMMIT="$(git -C "$ROOT" rev-parse --short=8 HEAD 2>/dev/null || echo dev)"
BUILD_TIME="$(date +%FT%T%z)"
GO_VERSION="$(go env GOVERSION 2>/dev/null || echo unknown)"
LDFLAGS="-X ${CONFIG_PKG}.Version=${VERSION} -X ${CONFIG_PKG}.GitCommit=${GIT_COMMIT} -X ${CONFIG_PKG}.BuildTime=${BUILD_TIME} -X ${CONFIG_PKG}.GoVersion=${GO_VERSION}"

need_cmd docker
need_cmd go
mkdir -p "$BUILD_DIR" "$GOCACHE" "$GOMODCACHE"

build_controlplane() {
  if ((admin_ui)); then
    need_cmd pnpm
    log "building SaaS admin UI"
    pnpm --dir "$ROOT/web/saas-admin" build
    rm -rf "$ROOT/internal/saas/api/dist"
    mkdir -p "$ROOT/internal/saas/api/dist"
    cp -R "$ROOT/web/saas-admin/dist/." "$ROOT/internal/saas/api/dist/"
  fi

  log "building controlplane binaries"
  (
    cd "$ROOT"
    go build -ldflags "$LDFLAGS" -o "$BUILD_DIR/picoclaw-saas" ./cmd/picoclaw-saas
    go build -ldflags "$LDFLAGS" -o "$BUILD_DIR/picoclaw-tenantctl" ./cmd/picoclaw-tenantctl
  )
}

build_tenants() {
  if ((tenant_ui)); then
    need_cmd pnpm
    log "building tenant launcher UI"
    pnpm --dir "$ROOT/web/frontend" build:backend
  fi

  log "building tenant binaries with tags: $GO_BUILD_TAGS"
  (
    cd "$ROOT"
    go build -tags "$GO_BUILD_TAGS" -ldflags "$LDFLAGS" -o "$BUILD_DIR/picoclaw" ./cmd/picoclaw
    go build -tags "$GO_BUILD_TAGS" -ldflags "$LDFLAGS" -o "$BUILD_DIR/picoclaw-launcher" ./web/backend
  )
}

copy_binary() {
  local container="$1"
  local src="$2"
  local dest="$3"
  local tmp="${dest}.devsync"

  [[ -f "$src" ]] || die "binary not found: $src"
  docker inspect "$container" >/dev/null 2>&1 || die "container not found: $container"

  docker cp "$src" "$container:$tmp"
  docker exec "$container" sh -lc "chmod 755 '$tmp' && mv -f '$tmp' '$dest'"
}

wait_container() {
  local container="$1"
  local want="${2:-healthy}"
  local deadline=$((SECONDS + 90))
  local status=""

  while ((SECONDS < deadline)); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    if [[ "$want" == "healthy" ]]; then
      [[ "$status" == "healthy" || "$status" == "running" ]] && return 0
    else
      [[ "$status" == "$want" ]] && return 0
    fi
    sleep 2
  done

  echo "warning: $container did not reach $want; last status: ${status:-unknown}" >&2
  return 1
}

sync_controlplane() {
  log "syncing controlplane container: $CONTROLPLANE_CONTAINER"
  copy_binary "$CONTROLPLANE_CONTAINER" "$BUILD_DIR/picoclaw-saas" /usr/local/bin/picoclaw-saas
  copy_binary "$CONTROLPLANE_CONTAINER" "$BUILD_DIR/picoclaw-tenantctl" /usr/local/bin/picoclaw-tenantctl

  if ((restart_containers)); then
    docker restart "$CONTROLPLANE_CONTAINER" >/dev/null
    wait_container "$CONTROLPLANE_CONTAINER" healthy || true
  fi
}

tenant_containers() {
  if ((${#tenant_args[@]})); then
    local value
    for value in "${tenant_args[@]}"; do
      if [[ "$value" == tenant-* ]]; then
        printf '%s\n' "$value"
      else
        printf 'tenant-%s\n' "$value"
      fi
    done
    return
  fi
  docker ps --format '{{.Names}}' | grep '^tenant-' | sort
}

sync_tenants() {
  local containers=()
  mapfile -t containers < <(tenant_containers)
  ((${#containers[@]})) || die "no tenant containers found"

  local container
  for container in "${containers[@]}"; do
    log "syncing tenant container: $container"
    copy_binary "$container" "$BUILD_DIR/picoclaw" /usr/local/bin/picoclaw
    copy_binary "$container" "$BUILD_DIR/picoclaw-launcher" /usr/local/bin/picoclaw-launcher
    if ((restart_containers)); then
      docker restart "$container" >/dev/null
      wait_container "$container" healthy || true
    fi
  done
}

if ((skip_build == 0)); then
  case "$target" in
    controlplane)
      build_controlplane
      ;;
    tenants)
      build_tenants
      ;;
    all)
      build_controlplane
      build_tenants
      ;;
  esac
fi

case "$target" in
  controlplane)
    sync_controlplane
    ;;
  tenants)
    sync_tenants
    ;;
  all)
    sync_controlplane
    sync_tenants
    ;;
esac

log "dev sync complete"
