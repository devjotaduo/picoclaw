#!/usr/bin/env bash
#
# Configure Docker daemon log rotation so container JSON logs cannot grow
# unbounded.
#
# Idempotent: merges with any existing /etc/docker/daemon.json instead of
# clobbering. Re-running with the same target values is a no-op.
#
# IMPORTANT: existing containers keep their old log config until they are
# recreated. The controlplane is recreated automatically by the auto-deploy
# timer, so it picks up the new config on the next deploy. Tenant
# containers and traefik continue with unbounded logs until you recreate
# them manually — by design (we don't want this script flapping prod
# containers).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required (apt install jq)" >&2
  exit 1
fi

DAEMON_JSON=/etc/docker/daemon.json
BACKUP="$DAEMON_JSON.bak.$(date +%Y%m%d-%H%M%S)"

# Target config we want to ensure is present.
DESIRED=$(cat <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
JSON
)

mkdir -p /etc/docker

if [ -f "$DAEMON_JSON" ]; then
  # Already configured the way we want? Bail silently.
  if jq -e --argjson desired "$DESIRED" '
    .["log-driver"] == $desired["log-driver"] and
    (.["log-opts"] // {}) == $desired["log-opts"]
  ' "$DAEMON_JSON" >/dev/null 2>&1; then
    echo "==> daemon.json already has the target log rotation config — no change"
    exit 0
  fi

  echo "==> backing up existing $DAEMON_JSON -> $BACKUP"
  cp -a "$DAEMON_JSON" "$BACKUP"

  echo "==> merging log rotation into existing daemon.json"
  TMP=$(mktemp)
  jq --argjson desired "$DESIRED" '. * $desired' "$DAEMON_JSON" > "$TMP"
  mv "$TMP" "$DAEMON_JSON"
else
  echo "==> writing fresh $DAEMON_JSON with log rotation"
  echo "$DESIRED" > "$DAEMON_JSON"
fi

chmod 0644 "$DAEMON_JSON"

cat <<'NOTE'

==> daemon.json updated. Verify with:
    cat /etc/docker/daemon.json

To activate the new config, restart the Docker daemon:
    systemctl restart docker

WARNING: `systemctl restart docker` briefly stops ALL containers on this
host (controlplane, traefik, postgres, every tenant). It is INTENTIONALLY
not done by this script — pick a maintenance window.

After restart, only containers that are subsequently recreated will use
the new log config. Already-running containers keep their original log
settings until recreated (compose up -d --force-recreate, etc.).

NOTE
