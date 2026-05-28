#!/usr/bin/env bash
# claude-auth-expiry-check.sh — alerts when the operator's claude-cli
# OAuth credentials are about to expire (or already expired) on the VPS.
#
# Background: tenants using provider=claude-cli rely on the operator's
# `.credentials.json` bind-mounted at /etc/picoclaw/claude-auth/.claude/.
# When the OAuth tokens expire, every Sofia/Catarina LLM call returns
# 401 silently — `claude auth status` keeps reporting loggedIn=true
# (only checks file structure, not API), so nothing alerts. Audit P1
# #32 (gap report 2026-05-27), confirmed live 2026-05-28 when the
# funnel ground to a halt for ~6h before anyone noticed.
#
# This script: read expiresAt from the credentials file, compute hours
# until expiry, emit a one-line log that systemd-journal captures.
# When critical (< 7d), also writes a heartbeat-style flag file that
# external monitoring can stat. When already expired, exits non-zero
# (systemd marks the unit failed; alarms can hook on that).
#
# Schedule via systemd timer (claude-auth-expiry-check.timer) — runs
# 1x/day. Operator re-logs in (laptop) + scp's new credentials when
# alerted.
#
# Exit codes:
#   0   ok (> 7 days remaining) OR warn (< 7 days but > 0)
#   1   expired — credentials already invalid; LLM calls failing now
#   2   credentials file missing or unparseable

set -euo pipefail

CREDS="${PICOCLAW_CLAUDE_CREDS_FILE:-/etc/picoclaw/claude-auth/.claude/.credentials.json}"
HEARTBEAT="${PICOCLAW_CLAUDE_AUTH_STATUS_FILE:-/var/lib/picoclaw-pg-dumps/.claude-auth-status}"
WARN_DAYS="${PICOCLAW_CLAUDE_AUTH_WARN_DAYS:-7}"

log() { echo "[claude-auth-check $(date -Iseconds)] $*"; }

if [ ! -f "$CREDS" ]; then
  log "ERROR: credentials file missing at $CREDS"
  mkdir -p "$(dirname "$HEARTBEAT")"
  echo "$(date -Iseconds) status=missing path=$CREDS" > "$HEARTBEAT"
  exit 2
fi

# Use python3 to parse JSON (universally available; jq isn't always installed)
EXPIRES_AT_MS=$(python3 -c "
import json, sys
try:
    d = json.load(open('$CREDS'))
    o = d.get('claudeAiOauth') or {}
    print(o.get('expiresAt', 0))
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(2)
" 2>&1)

if ! [[ "$EXPIRES_AT_MS" =~ ^[0-9]+$ ]]; then
  log "ERROR: failed to read expiresAt from $CREDS: $EXPIRES_AT_MS"
  mkdir -p "$(dirname "$HEARTBEAT")"
  echo "$(date -Iseconds) status=unparseable path=$CREDS error=$EXPIRES_AT_MS" > "$HEARTBEAT"
  exit 2
fi

NOW_MS=$(( $(date +%s) * 1000 ))
HOURS_REMAINING=$(( (EXPIRES_AT_MS - NOW_MS) / 1000 / 3600 ))
DAYS_REMAINING=$(( HOURS_REMAINING / 24 ))
EXPIRES_HUMAN=$(python3 -c "import datetime; print(datetime.datetime.fromtimestamp($EXPIRES_AT_MS / 1000).strftime('%Y-%m-%dT%H:%M:%SZ'))")

mkdir -p "$(dirname "$HEARTBEAT")"

if [ "$HOURS_REMAINING" -le 0 ]; then
  log "EXPIRED: claude-cli OAuth credentials expired at $EXPIRES_HUMAN ($((-HOURS_REMAINING)) hours ago). Operator must \`claude /login\` on laptop and scp ~/.claude/.credentials.json to pico:$CREDS"
  echo "$(date -Iseconds) status=expired hours_overdue=$((-HOURS_REMAINING)) expires_at=$EXPIRES_HUMAN" > "$HEARTBEAT"
  exit 1
fi

if [ "$DAYS_REMAINING" -lt "$WARN_DAYS" ]; then
  log "WARN: claude-cli OAuth credentials expire in $DAYS_REMAINING days ($HOURS_REMAINING hours) at $EXPIRES_HUMAN. Re-login before this date to avoid funnel outage."
  echo "$(date -Iseconds) status=warn days_remaining=$DAYS_REMAINING hours_remaining=$HOURS_REMAINING expires_at=$EXPIRES_HUMAN" > "$HEARTBEAT"
  exit 0
fi

log "OK: claude-cli OAuth credentials valid for $DAYS_REMAINING days ($HOURS_REMAINING hours), expire at $EXPIRES_HUMAN"
echo "$(date -Iseconds) status=ok days_remaining=$DAYS_REMAINING hours_remaining=$HOURS_REMAINING expires_at=$EXPIRES_HUMAN" > "$HEARTBEAT"
exit 0
