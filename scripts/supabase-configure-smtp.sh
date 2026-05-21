#!/usr/bin/env bash
# Configure Supabase Auth SMTP for the Picoclaw SaaS project via Management API.
#
# Why: the controlplane Mailer.SendCredentialsEmail already delivers the
# combined "URL + email + senha + magic link" message via Brevo. We point
# Supabase's own auth emails at the same Brevo account so the (rare)
# AdminGenerateLink-triggered messages stop using Supabase's restricted
# in-built sender (which only ships to project team members anyway).
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN="sbp_..."       # from https://supabase.com/dashboard/account/tokens
#   ./scripts/supabase-configure-smtp.sh         # apply
#   ./scripts/supabase-configure-smtp.sh --get   # just read current config
#
# Rotate the PAT immediately after running this script — it has full account
# access. Either delete it on the dashboard or generate a new one.

set -euo pipefail

PROJECT_REF="dgldymxofhmsfeuzgoig"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN not set." >&2
  echo "Generate one at https://supabase.com/dashboard/account/tokens" >&2
  exit 1
fi

# --- mode: --get just reads ----------------------------------------------
if [[ "${1:-}" == "--get" ]]; then
  echo "GET ${API}"
  curl -sS -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" "${API}" | jq '{
    external_email_enabled,
    mailer_autoconfirm,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_sender_name,
    smtp_admin_email,
    mailer_subjects_magic_link,
    mailer_subjects_invite,
    mailer_subjects_recovery,
    mailer_subjects_confirmation,
    rate_limit_email_sent
  }'
  exit 0
fi

# --- apply Brevo SMTP -----------------------------------------------------
# SMTP credentials come from the same docker/saas/.env.supabase.local that
# Mailer.SendCredentialsEmail uses. Source the env before running this script,
# OR export the SMTP_* vars inline. Never hard-code the SMTP key here — it's
# secret-scannable and pushing it to origin will block the PR.
#
# smtp_port must be a string in the Management API payload (the GoTrue
# config validator rejects numeric values with "Expected string, received
# number"). Keep it quoted in the JSON below.
SMTP_HOST="${SMTP_HOST:-smtp-relay.brevo.com}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:?SMTP_USER required (e.g. Brevo SMTP login from app.brevo.com/smtp)}"
SMTP_PASS="${SMTP_PASSWORD:?SMTP_PASSWORD required (Brevo SMTP key)}"
SMTP_ADMIN_EMAIL="${MAILER_FROM:-contato@jotaduo.com}"
SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-Jotaduo}"

# rate_limit_email_sent stays at a low value (10/h) — almost nothing should
# reach Supabase's send path in practice (our own Mailer delivers the
# credentials email after each provision), so a low cap is a good guard
# against bots abusing public auth endpoints.
echo "PATCH ${API}"
RESPONSE=$(curl -sS -X PATCH "${API}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{
  "external_email_enabled": true,
  "mailer_autoconfirm": false,
  "mailer_secure_email_change_enabled": true,
  "smtp_host": "${SMTP_HOST}",
  "smtp_port": "${SMTP_PORT}",
  "smtp_user": "${SMTP_USER}",
  "smtp_pass": "${SMTP_PASS}",
  "smtp_admin_email": "${SMTP_ADMIN_EMAIL}",
  "smtp_sender_name": "${SMTP_SENDER_NAME}",
  "rate_limit_email_sent": 10
}
JSON
)")

echo "${RESPONSE}" | jq '{
  smtp_host,
  smtp_port,
  smtp_user,
  smtp_sender_name,
  smtp_admin_email,
  external_email_enabled,
  rate_limit_email_sent
}'

echo ""
echo "Done. Verify by re-running with --get."
echo "REMINDER: rotate the PAT at https://supabase.com/dashboard/account/tokens"
