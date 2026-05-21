#!/usr/bin/env bash
# onboarding-mark-qualified
#
# Tells the Picoclaw SaaS controlplane that the agent finished the discovery
# flow for this intake. Idempotent — second/third calls keep the original
# qualified_at timestamp.
#
# Authentication: HMAC-SHA256(raw_body) over the JSON payload using
# PICOCLAW_ONBOARDING_CALLBACK_SECRET (shared with the controlplane). Sent as
# the X-Onboarding-Signature header. The controlplane rejects timestamps
# outside ±5 min, so this script always uses `date +%s` for fresh ts.
#
# Required env (set on the onboarding tenant container, see Phase 9 bootstrap):
#   PICOCLAW_ONBOARDING_CALLBACK_URL   e.g. https://adm.jotaduo.com
#   PICOCLAW_ONBOARDING_CALLBACK_SECRET (hex string, ≥32 chars)
#
# Usage:
#   mark-qualified.sh <intake_id>
#
# Exit codes:
#   0   success (controlplane returned 204)
#   1   missing args or env
#   2   network/controlplane error (curl exit code preserved)
#   3   controlplane returned non-2xx (response body printed to stderr)

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: mark-qualified.sh <intake_id>" >&2
  exit 1
fi

INTAKE_ID="$1"
URL="${PICOCLAW_ONBOARDING_CALLBACK_URL:?PICOCLAW_ONBOARDING_CALLBACK_URL required}"
SECRET="${PICOCLAW_ONBOARDING_CALLBACK_SECRET:?PICOCLAW_ONBOARDING_CALLBACK_SECRET required}"

# Strip trailing slash so we don't end up with a double slash in the path.
URL="${URL%/}"
TS="$(date +%s)"

# Build the body deterministically — every byte of the JSON gets signed, so
# any whitespace change here MUST match what the controlplane reads (it reads
# r.Body verbatim before unmarshaling).
BODY="$(printf '{"intake_id":"%s","action":"mark_qualified","ts":%s}' "$INTAKE_ID" "$TS")"

SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')"

HTTP_STATUS="$(curl -sS -o /tmp/mark-qualified-$$.out -w '%{http_code}' \
  -X POST "${URL}/api/v1/onboarding-callback" \
  -H 'Content-Type: application/json' \
  -H "X-Onboarding-Signature: ${SIG}" \
  -d "$BODY" 2>&1)" || {
    rc=$?
    echo "mark-qualified: curl failed (rc=$rc)" >&2
    rm -f "/tmp/mark-qualified-$$.out"
    exit 2
  }

if [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
  rm -f "/tmp/mark-qualified-$$.out"
  echo "ok: intake $INTAKE_ID marked qualified"
  exit 0
fi

echo "mark-qualified: controlplane returned $HTTP_STATUS" >&2
cat "/tmp/mark-qualified-$$.out" >&2 || true
rm -f "/tmp/mark-qualified-$$.out"
exit 3
