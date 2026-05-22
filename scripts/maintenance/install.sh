#!/usr/bin/env bash
#
# One-shot installer for the maintenance suite on the SaaS VPS:
#   - picoclaw-cleanup.timer (weekly Docker prune)
#   - journald retention (drop-in)
#   - Docker daemon log rotation (does NOT restart docker — see warning)
#
# Idempotent: safe to re-run after editing the .sh / .service / .timer
# files in this directory.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Weekly cleanup timer ──────────────────────────────────────────
echo "==> Installing picoclaw-cleanup script + systemd units"
install -m 0755 "$SRC_DIR/picoclaw-cleanup.sh"      /usr/local/bin/picoclaw-cleanup.sh
install -m 0644 "$SRC_DIR/picoclaw-cleanup.service" /etc/systemd/system/picoclaw-cleanup.service
install -m 0644 "$SRC_DIR/picoclaw-cleanup.timer"   /etc/systemd/system/picoclaw-cleanup.timer

systemctl daemon-reload
systemctl enable --now picoclaw-cleanup.timer
echo

# ── 2. Journal retention drop-in ─────────────────────────────────────
echo "==> Installing journald retention drop-in"
bash "$SRC_DIR/install-journal-retention.sh"
echo

# ── 3. Docker log rotation (CONFIG ONLY — does not restart docker) ───
echo "==> Configuring Docker daemon log rotation (config only)"
bash "$SRC_DIR/install-docker-log-rotation.sh"
echo

# ── Summary ──────────────────────────────────────────────────────────
echo "==> All installed. Next scheduled cleanup:"
systemctl list-timers picoclaw-cleanup.timer --no-pager
echo
cat <<'TAIL'
==> Cheat sheet
  Cleanup log:        journalctl -u picoclaw-cleanup.service -n 200 --no-pager
  Force cleanup now:  systemctl start picoclaw-cleanup.service
  Pause cleanup:      systemctl stop picoclaw-cleanup.timer
  Journal usage:      journalctl --disk-usage

==> Pending action (one-time, your call when):
  To activate Docker log rotation for FUTURE recreates of containers,
  pick a maintenance window and run:
      systemctl restart docker
  (This briefly stops every container; the auto-deploy timer will
  bring the controlplane back up on the next tick.)
TAIL
