#!/usr/bin/env bash
# onboarding-submit-intake
#
# Submits the finalized intake (with contact_email + optional contact_whatsapp)
# to the Picoclaw SaaS controlplane. This is what triggers AutoProvisioner.Run
# on the controlplane side: a new tenant container is created for the visitor's
# company, and the credentials email is delivered via Mailer.SendCredentialsEmail.
#
# Authentication: same HMAC scheme as mark-qualified.sh (see that file for the
# protocol).
#
# Required env:
#   PICOCLAW_ONBOARDING_CALLBACK_URL
#   PICOCLAW_ONBOARDING_CALLBACK_SECRET
#
# Auto-detected env (injected by pkg/tools.ExecTool from the active chat
# context — see buildToolEnv in pkg/tools/shell.go):
#   PICOCLAW_CHAT_SESSION_ID   the publicweb session_id, which the browser
#                              sets to the intake_id. Used as default for
#                              <intake_id> when no positional arg is passed.
#
# Usage:
#   submit-intake.sh <contact_email> [contact_whatsapp]              # 2 args: intake_id defaults to $PICOCLAW_CHAT_SESSION_ID
#   submit-intake.sh <intake_id> <contact_email> [contact_whatsapp]  # 3 args: explicit override
#
# Exit codes:
#   0   success (controlplane returned 200, provisioning info in stdout)
#   1   missing args or env
#   2   network/controlplane error
#   3   controlplane returned non-2xx

set -euo pipefail

# Two calling conventions:
#   * 1-2 args: contact_email[, contact_whatsapp] — intake_id from env.
#   * 3 args:   intake_id, contact_email, contact_whatsapp — full override.
#
# Detect by counting args. Email is the only mandatory field either way.
if [[ $# -ge 3 ]]; then
  INTAKE_ID="$1"
  CONTACT_EMAIL="$2"
  CONTACT_WHATSAPP="${3:-}"
elif [[ $# -ge 1 ]]; then
  INTAKE_ID="${PICOCLAW_CHAT_SESSION_ID:-}"
  CONTACT_EMAIL="$1"
  CONTACT_WHATSAPP="${2:-}"
else
  echo "usage: submit-intake.sh <contact_email> [contact_whatsapp] | <intake_id> <contact_email> [contact_whatsapp]" >&2
  exit 1
fi

if [[ -z "$INTAKE_ID" ]]; then
  echo "submit-intake: intake_id missing — pass as \$1 (3-arg form) or set PICOCLAW_CHAT_SESSION_ID" >&2
  exit 1
fi
if [[ -z "$CONTACT_EMAIL" ]]; then
  echo "submit-intake: contact_email is required" >&2
  exit 1
fi
URL="${PICOCLAW_ONBOARDING_CALLBACK_URL:?PICOCLAW_ONBOARDING_CALLBACK_URL required}"
SECRET="${PICOCLAW_ONBOARDING_CALLBACK_SECRET:?PICOCLAW_ONBOARDING_CALLBACK_SECRET required}"

URL="${URL%/}"
TS="$(date +%s)"

# Escape any double-quotes the agent might have collected in the contact info.
# Email/whatsapp are short ASCII; nothing fancy needed beyond \" and \\.
escape_json() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}
ESC_EMAIL="$(escape_json "$CONTACT_EMAIL")"
ESC_WA="$(escape_json "$CONTACT_WHATSAPP")"

# Visitor IP — the public-web channel exports it as $PICOCLAW_VISITOR_IP
# when dispatching the skill, so the controlplane can rate-limit the
# AutoProvisioner per-visitor (instead of per-controlplane-loopback,
# which would collapse every callback to a single rate-limit key).
# Optional: omitted from the JSON body when empty.
VISITOR_IP="${PICOCLAW_VISITOR_IP:-}"
ESC_IP="$(escape_json "$VISITOR_IP")"
if [[ -n "$VISITOR_IP" ]]; then
  BODY="$(printf '{"intake_id":"%s","action":"submit_intake","contact_email":"%s","contact_whatsapp":"%s","visitor_ip":"%s","ts":%s}' \
    "$INTAKE_ID" "$ESC_EMAIL" "$ESC_WA" "$ESC_IP" "$TS")"
else
  BODY="$(printf '{"intake_id":"%s","action":"submit_intake","contact_email":"%s","contact_whatsapp":"%s","ts":%s}' \
    "$INTAKE_ID" "$ESC_EMAIL" "$ESC_WA" "$TS")"
fi

SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')"

HTTP_STATUS="$(curl -sS -o /tmp/submit-intake-$$.out -w '%{http_code}' \
  -X POST "${URL}/api/v1/onboarding-callback" \
  -H 'Content-Type: application/json' \
  -H "X-Onboarding-Signature: ${SIG}" \
  -d "$BODY" 2>&1)" || {
    rc=$?
    echo "submit-intake: curl failed (rc=$rc)" >&2
    rm -f "/tmp/submit-intake-$$.out"
    exit 2
  }

if [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
  # 200 body is the AutoProvisioner result (tenant_provisioned, url,
  # initial_password, etc.) — pass it through to the agent's stdout so the
  # LLM can fold the details into its final message to the visitor.
  cat "/tmp/submit-intake-$$.out"
  rm -f "/tmp/submit-intake-$$.out"
  exit 0
fi

echo "submit-intake: controlplane returned $HTTP_STATUS" >&2
cat "/tmp/submit-intake-$$.out" >&2 || true
rm -f "/tmp/submit-intake-$$.out"
exit 3
