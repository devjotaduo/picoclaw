#!/usr/bin/env bash
#
# Install (or reinstall) the daily R2 backup timer on this VPS.
# Idempotent — safe to re-run after editing the .sh/.service/.timer here.
#
# REQUIRES: /etc/picoclaw/r2-backup.env populated with R2 credentials
# and a restic passphrase. See r2-backup.env.example.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
SECRETS_DIR=/etc/picoclaw
ENV_FILE="$SECRETS_DIR/r2-backup.env"

# ── 1. restic ──────────────────────────────────────────────────
if ! command -v restic >/dev/null 2>&1; then
  echo "==> installing restic from apt"
  apt-get update -qq
  apt-get install -yqq restic
else
  echo "==> restic already installed: $(restic version | head -1)"
fi

# ── 2. secrets dir + env file ─────────────────────────────────
mkdir -p "$SECRETS_DIR"
chmod 0700 "$SECRETS_DIR"

# Postgres dump staging dir (audit P0 #3). The backup script writes
# pg_dumpall here right before restic snapshots it. 0700 root-only —
# the dump contains all secrets in plaintext (well, dump-encoded).
mkdir -p /var/lib/picoclaw-pg-dumps
chmod 0700 /var/lib/picoclaw-pg-dumps

# Institutional WhatsApp sidecar state. The directory is safe to snapshot
# empty on hosts that are not paired yet, and required once jotaduo-wa is live.
mkdir -p /srv/picoclaw/jotaduo-wa
chmod 0700 /srv/picoclaw/jotaduo-wa

if [ ! -f "$ENV_FILE" ]; then
  echo "==> seeding $ENV_FILE from template (you MUST edit it before the backup will run)"
  install -m 0600 "$SRC_DIR/r2-backup.env.example" "$ENV_FILE"
  NEED_EDIT=1
else
  chmod 0600 "$ENV_FILE"
  NEED_EDIT=0
fi

# ── 3. systemd units + backup script ──────────────────────────
echo "==> installing backup script + systemd units"
install -m 0750 "$SRC_DIR/picoclaw-r2-backup.sh"      /usr/local/bin/picoclaw-r2-backup.sh
install -m 0644 "$SRC_DIR/picoclaw-r2-backup.service" /etc/systemd/system/picoclaw-r2-backup.service
install -m 0644 "$SRC_DIR/picoclaw-r2-backup.timer"   /etc/systemd/system/picoclaw-r2-backup.timer

systemctl daemon-reload
systemctl enable --now picoclaw-r2-backup.timer

echo
echo "==> Timer state:"
systemctl status picoclaw-r2-backup.timer --no-pager --lines=0 || true
echo
echo "==> Next scheduled backup:"
systemctl list-timers picoclaw-r2-backup.timer --no-pager

if [ "$NEED_EDIT" = "1" ]; then
  cat <<MSG

⚠️  EDIT $ENV_FILE BEFORE THE NEXT TIMER FIRE.

The timer is enabled, but the backup script will exit early with a clear
error until R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT /
R2_BUCKET / RESTIC_PASSWORD are populated.

Once filled:
  systemctl start picoclaw-r2-backup.service   # force a first backup
  journalctl -u picoclaw-r2-backup.service -f  # watch progress

The first run will be a full upload (slow). Subsequent runs are deduped
deltas (fast).

MSG
fi

cat <<'TAIL'
==> Cheat sheet
  Watch backup log:   journalctl -u picoclaw-r2-backup.service -f
  Last 200 lines:     journalctl -u picoclaw-r2-backup.service -n 200 --no-pager
  Force backup now:   systemctl start picoclaw-r2-backup.service
  Pause backups:      systemctl stop picoclaw-r2-backup.timer
  Disable on boot:    systemctl disable picoclaw-r2-backup.timer

  Inspect snapshots:
    set -a; source /etc/picoclaw/r2-backup.env; set +a
    export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}"
    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    restic snapshots
    restic stats
TAIL
