#!/usr/bin/env bash
# Provisions the public onboarding tenant (one-time, per environment).
# Creates a tenant with is_public=true seeded from a Workspace whose slug
# defaults to "onboarding" (override via WORKSPACE_ID).
#
# Prereqs:
#   - You created a workspace via adm.<base>/workspaces. The recommended
#     flow is to package the dev workspace at the repo root (`workspace/`)
#     via `pwsh scripts/build-workspace-zip.ps1 -SourceDir workspace -Slug
#     onboarding -Upload` — that uploads a validated ZIP and gives you a
#     workspace_id. Alternative: use the admin UI's "Importar do
#     $PICOCLAW_HOME" against your local PICOCLAW_HOME.
#   - You are a platform_admin on the controlplane.
#   - Your saas-admin session cookie is exported as ADM_SESSION_COOKIE.
#   - CONTROLPLANE_URL points at the controlplane (default: https://adm.jotaduo.com).
#
# Usage:
#   export ADM_SESSION_COOKIE="$(grep picoclaw_admin_session ~/.cookies | awk ...)"
#   ./scripts/provision-onboarding-tenant.sh
#
# Idempotency: if the tenant already exists (409), the script reports it and
# exits 0 — safe to re-run.

set -euo pipefail

CONTROLPLANE_URL="${CONTROLPLANE_URL:-https://adm.jotaduo.com}"
SUBDOMAIN="${ONBOARDING_SUBDOMAIN:-onboarding}"
DISPLAY_NAME="${ONBOARDING_DISPLAY_NAME:-Onboarding Jotaduo}"
WORKSPACE_ID="${WORKSPACE_ID:-}"  # empty = controlplane looks up slug "onboarding"

if [[ -z "${ADM_SESSION_COOKIE:-}" ]]; then
  echo "ERROR: ADM_SESSION_COOKIE not set." >&2
  echo "Login to ${CONTROLPLANE_URL}/login, then copy picoclaw_admin_session cookie value." >&2
  exit 1
fi

# Build the JSON payload with proper escaping. Prefer jq when available so
# special characters in the env-provided values (quotes, backslashes,
# newlines) don't break the request. Fall back to a sed-based escaper for
# environments without jq.
if command -v jq >/dev/null 2>&1; then
  PAYLOAD="$(jq -n \
    --arg display_name "$DISPLAY_NAME" \
    --arg subdomain "$SUBDOMAIN" \
    --arg workspace_id "$WORKSPACE_ID" \
    '{display_name: $display_name, subdomain: $subdomain, workspace_id: $workspace_id}')"
else
  json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
  }
  PAYLOAD=$(printf '{"display_name":"%s","subdomain":"%s","workspace_id":"%s"}' \
    "$(json_escape "$DISPLAY_NAME")" \
    "$(json_escape "$SUBDOMAIN")" \
    "$(json_escape "$WORKSPACE_ID")")
fi

RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST \
  "${CONTROLPLANE_URL}/api/v1/tenants/onboarding/bootstrap" \
  -H "Content-Type: application/json" \
  -H "Cookie: picoclaw_admin_session=${ADM_SESSION_COOKIE}" \
  -d "$PAYLOAD")

STATUS="${RESPONSE##*$'\n'}"
BODY="${RESPONSE%$'\n'*}"

case "$STATUS" in
  201)
    echo "OK — onboarding tenant provisioned."
    echo "$BODY"
    ;;
  409)
    echo "Tenant already exists (idempotent re-run is safe). Body:"
    echo "$BODY"
    exit 0
    ;;
  *)
    echo "ERROR: status $STATUS"
    echo "$BODY"
    exit 1
    ;;
esac
