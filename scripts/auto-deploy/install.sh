#!/usr/bin/env bash
#
# Install (or re-install) the picoclaw auto-deploy timer on this host.
#
# Idempotent: safe to run repeatedly to pick up edits to the .sh/.service/
# .timer files in this directory.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing files from $SRC_DIR"
install -m 0755 "$SRC_DIR/picoclaw-deploy.sh"      /usr/local/bin/picoclaw-deploy.sh
install -m 0644 "$SRC_DIR/picoclaw-deploy.service" /etc/systemd/system/picoclaw-deploy.service
install -m 0644 "$SRC_DIR/picoclaw-deploy.timer"   /etc/systemd/system/picoclaw-deploy.timer

systemctl daemon-reload
systemctl enable --now picoclaw-deploy.timer

echo
echo "Installed. Current state:"
systemctl status picoclaw-deploy.timer --no-pager --lines=0 || true
echo
echo "Next scheduled run:"
systemctl list-timers picoclaw-deploy.timer --no-pager
echo
echo "Follow logs with:  journalctl -u picoclaw-deploy.service -f"
echo "Pause auto-deploy: systemctl stop picoclaw-deploy.timer"
echo "Disable on boot:   systemctl disable picoclaw-deploy.timer"
