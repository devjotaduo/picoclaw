#!/usr/bin/env bash
#
# Install (or reinstall) the picoclaw auto-deploy timer on this VPS.
# Idempotent: safe to re-run after editing the .sh/.service/.timer files.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Checking prerequisites"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose plugin missing (need v2 plugin, not docker-compose v1)" >&2
  exit 1
fi

# Verify the compose file the deploy script expects exists.
COMPOSE_FILE="${PICOCLAW_COMPOSE_FILE:-/srv/saas/picoclaw/docker/saas/docker-compose.yml}"
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: compose file not found at $COMPOSE_FILE" >&2
  echo "       (override with PICOCLAW_COMPOSE_FILE env if it's elsewhere)" >&2
  exit 1
fi

# GHCR auth: not strictly required if the package is public, but warn
# loudly so private repos don't fail silently at 3 AM.
if ! grep -q ghcr.io /root/.docker/config.json 2>/dev/null; then
  cat <<'MSG' >&2

WARNING: no ghcr.io credentials in /root/.docker/config.json.

If ghcr.io/devjotaduo/picoclaw-saas is a PRIVATE package, every pull will
fail. Run this once to authenticate (PAT needs the `read:packages` scope
only — do NOT give it write/admin):

  docker login ghcr.io -u <github-user>
  # paste PAT when prompted

The credentials live in /root/.docker/config.json on this VPS only —
nothing is pushed to GitHub Secrets.

MSG
fi

echo "==> Installing files from $SRC_DIR"
install -m 0755 "$SRC_DIR/picoclaw-deploy.sh"      /usr/local/bin/picoclaw-deploy.sh
install -m 0644 "$SRC_DIR/picoclaw-deploy.service" /etc/systemd/system/picoclaw-deploy.service
install -m 0644 "$SRC_DIR/picoclaw-deploy.timer"   /etc/systemd/system/picoclaw-deploy.timer

systemctl daemon-reload
systemctl enable --now picoclaw-deploy.timer

echo
echo "==> Timer state:"
systemctl status picoclaw-deploy.timer --no-pager --lines=0 || true
echo
echo "==> Next scheduled run:"
systemctl list-timers picoclaw-deploy.timer --no-pager
echo
cat <<'TAIL'
==> Cheat sheet
  Live deploy log:    journalctl -u picoclaw-deploy.service -f
  Last 50 lines:      journalctl -u picoclaw-deploy.service -n 50 --no-pager
  Manual run now:     systemctl start picoclaw-deploy.service
  Pause auto-deploy:  systemctl stop picoclaw-deploy.timer
  Disable on boot:    systemctl disable picoclaw-deploy.timer
TAIL
