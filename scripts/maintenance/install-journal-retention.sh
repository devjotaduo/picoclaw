#!/usr/bin/env bash
#
# Cap systemd-journald disk usage. Writes a drop-in override at
# /etc/systemd/journald.conf.d/picoclaw-retention.conf so the main
# journald.conf stays pristine.
#
# Restarts systemd-journald to activate (brief log gap; does NOT touch
# containers).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

CONF_DIR=/etc/systemd/journald.conf.d
CONF_FILE="$CONF_DIR/picoclaw-retention.conf"

mkdir -p "$CONF_DIR"

cat > "$CONF_FILE" <<'CONF'
# Managed by scripts/maintenance/install-journal-retention.sh
# Keeps journal usage bounded; the box has 94G but no reason to let
# journal sprawl to multiple GB on a tiny SaaS workload.
[Journal]
SystemMaxUse=500M
SystemMaxFileSize=50M
MaxRetentionSec=30day
CONF

chmod 0644 "$CONF_FILE"

echo "==> wrote $CONF_FILE"
echo
echo "==> current journal disk usage:"
journalctl --disk-usage
echo
echo "==> restarting systemd-journald (brief log gap, ~1s)"
systemctl restart systemd-journald
echo
echo "==> done. Verify with:"
echo "    journalctl --disk-usage"
echo "    systemd-analyze cat-config systemd/journald.conf"
