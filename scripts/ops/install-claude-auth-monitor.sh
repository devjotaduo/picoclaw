#!/usr/bin/env bash
# install-claude-auth-monitor.sh — install/upgrade the claude-cli OAuth
# expiry-check timer on the VPS. Idempotent; safe to re-run.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> installing script + systemd units"
install -m 0750 "$SRC_DIR/claude-auth-expiry-check.sh"      /usr/local/bin/claude-auth-expiry-check.sh
install -m 0644 "$SRC_DIR/claude-auth-expiry-check.service" /etc/systemd/system/claude-auth-expiry-check.service
install -m 0644 "$SRC_DIR/claude-auth-expiry-check.timer"   /etc/systemd/system/claude-auth-expiry-check.timer

systemctl daemon-reload
systemctl enable --now claude-auth-expiry-check.timer

echo
echo "==> timer state:"
systemctl status claude-auth-expiry-check.timer --no-pager --lines=0 || true

echo
echo "==> running immediate check to validate install:"
systemctl start claude-auth-expiry-check.service
sleep 2
journalctl -u claude-auth-expiry-check.service -n 5 --no-pager
echo
echo "==> current status file:"
cat /var/lib/picoclaw-pg-dumps/.claude-auth-status 2>/dev/null || echo "(status file not yet written)"

cat <<'TAIL'

==> cheat sheet
  Force check now:    systemctl start claude-auth-expiry-check.service
  Watch log:          journalctl -u claude-auth-expiry-check.service -f
  Status file:        cat /var/lib/picoclaw-pg-dumps/.claude-auth-status
  Pause checks:       systemctl stop claude-auth-expiry-check.timer
  Next scheduled:     systemctl list-timers claude-auth-expiry-check.timer

  When alerted (status=warn or status=expired):
    1. On laptop: claude /login   (browser OAuth flow)
    2. scp ~/.claude/.credentials.json pico:/etc/picoclaw/claude-auth/.claude/.credentials.json
    3. Validate: ssh pico 'docker exec tenant-<id> claude --print "ok"'
TAIL
