#!/usr/bin/env bash
# enviar-whatsapp-jotaduo / send.sh
#
# POSTs an outbound WhatsApp message to the jotaduo-wa sidecar so the
# institutional Jotaduo WA delivers it. The sidecar handles the actual
# whatsmeow send + auto-registers the routing so the lead's reply lands
# back in this tenant (see Fatia 4 for the inbound dispatch).
#
# Mirrors the HMAC pattern of skills/onboarding-mark-qualified/scripts/
# mark-qualified.sh so workspace operators only need to learn one shape.
#
# Required env (injected by the provisioner ONLY in public tenants —
# Fatia 3 of the WhatsApp-shared plan):
#   JOTADUO_WA_URL          e.g. http://jotaduo-wa:18810
#   JOTADUO_WA_HMAC_SECRET  hex string, shared with the sidecar
#
# Auto-injected by every tenant container (existing convention):
#   PICOCLAW_TENANT_ID      the tenant's stable id; used as routing key
#
# Usage:
#   send.sh <phone> <message>
#
# Exit codes:
#   0   sent (sidecar returned 2xx)
#   1   missing args or env (likely running in a cliente tenant by mistake)
#   2   network failure talking to sidecar (curl rc preserved)
#   3   sidecar returned non-2xx (response body printed to stderr)

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "send.sh: usage: send.sh <phone> <message>" >&2
  exit 1
fi

PHONE="$1"
shift
# Everything after $1 is the message body — preserves spaces without
# requiring the caller to quote the whole thing twice.
MESSAGE="$*"

if [[ -z "${PHONE// }" || -z "${MESSAGE// }" ]]; then
  echo "send.sh: phone and message must be non-empty" >&2
  exit 1
fi

URL="${JOTADUO_WA_URL:-}"
SECRET="${JOTADUO_WA_HMAC_SECRET:-}"
TENANT="${PICOCLAW_TENANT_ID:-}"

if [[ -z "$URL" || -z "$SECRET" ]]; then
  echo "send.sh: JOTADUO_WA_URL and JOTADUO_WA_HMAC_SECRET are required." >&2
  echo "send.sh: these are only injected into public tenants (is_public=true)." >&2
  echo "send.sh: if this is a cliente tenant, you should use the tenant's own WhatsApp channel instead." >&2
  exit 1
fi
if [[ -z "$TENANT" ]]; then
  echo "send.sh: PICOCLAW_TENANT_ID is missing — the provisioner should always set it; check the container env." >&2
  exit 1
fi

URL="${URL%/}"
TS="$(date +%s)"

# Build the JSON body manually so we sign exactly the bytes the sidecar
# verifies. jq would re-order keys non-deterministically across versions;
# any whitespace change here MUST match the verifier (sidecar reads the
# raw body before json.Unmarshal).
#
# Escape backslash, double-quote, and control chars in the strings — bare
# minimum for valid JSON. Newlines in MESSAGE become \n. Tabs become \t.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"        # backslash first
  s="${s//\"/\\\"}"        # double-quote
  s="${s//$'\n'/\\n}"      # newline
  s="${s//$'\r'/\\r}"      # carriage return
  s="${s//$'\t'/\\t}"      # tab
  printf '%s' "$s"
}

PHONE_J="$(json_escape "$PHONE")"
MESSAGE_J="$(json_escape "$MESSAGE")"
TENANT_J="$(json_escape "$TENANT")"

BODY="$(printf '{"tenant_id":"%s","to":"%s","text":"%s","ts":%s}' \
  "$TENANT_J" "$PHONE_J" "$MESSAGE_J" "$TS")"

SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

HTTP_STATUS="$(curl -sS -o "$TMP" -w '%{http_code}' \
  -X POST "${URL}/internal/wa/send" \
  -H 'Content-Type: application/json' \
  -H "X-Jotaduo-WA-Signature: ${SIG}" \
  -d "$BODY" 2>&1)" || {
    rc=$?
    echo "send.sh: curl failed (rc=$rc) talking to $URL" >&2
    exit 2
  }

if [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
  # Sidecar responded with {status, message_ids, tenant_id}. Echo verbatim
  # so the calling agent can correlate IDs if needed.
  cat "$TMP"
  echo
  exit 0
fi

echo "send.sh: sidecar returned HTTP $HTTP_STATUS" >&2
cat "$TMP" >&2 || true
echo >&2
exit 3
