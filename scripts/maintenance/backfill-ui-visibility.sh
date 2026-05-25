#!/usr/bin/env bash
# Backfill ui-visibility.json#active_profile on tenants provisioned before
# the tenant-type-ui-visibility feature shipped.
#
# Older tenants either don't have ui-visibility.json at all (they inherit
# the frontend's DEFAULT_UI_VISIBILITY_POLICY at runtime) or have it with
# an empty/missing active_profile. After this rollout the frontend keys
# off active_profile directly, so anything that wasn't explicitly set
# during provisioning needs a value written into the file.
#
# Policy: existing tenants are live "cliente" workloads — they get
# active_profile="tenant". Anything already set to a non-empty value
# (admin/public/waiting/tenant) is left alone — those were chosen
# deliberately by the operator and we don't want to clobber them.
#
# Run on the VPS as root (needs write access to /srv/saas/tenants/*).
# Idempotent: safe to re-run.
#
# Usage:
#   sudo ./scripts/maintenance/backfill-ui-visibility.sh                 # apply
#   sudo DRY_RUN=1 ./scripts/maintenance/backfill-ui-visibility.sh       # preview only
#   sudo TENANTS_DIR=/custom/path ./scripts/maintenance/backfill-ui-visibility.sh

set -euo pipefail

TENANTS_DIR="${TENANTS_DIR:-/srv/saas/tenants}"
DEFAULT_PROFILE="${DEFAULT_PROFILE:-tenant}"
DRY_RUN="${DRY_RUN:-}"

if [[ ! -d "$TENANTS_DIR" ]]; then
  echo "error: tenants dir $TENANTS_DIR does not exist" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required" >&2
  exit 1
fi

shopt -s nullglob

count_seen=0
count_created=0
count_updated=0
count_skipped=0

for tenant_dir in "$TENANTS_DIR"/*/; do
  [[ -d "$tenant_dir" ]] || continue
  tenant_id="$(basename "$tenant_dir")"
  visibility_file="${tenant_dir%/}/ui-visibility.json"
  count_seen=$((count_seen + 1))

  # Read current active_profile (if any). Empty when file missing or no key.
  current=""
  if [[ -f "$visibility_file" ]]; then
    current="$(
      python3 - "$visibility_file" <<'PY'
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        doc = json.load(f)
    val = doc.get("active_profile", "")
    print(val if isinstance(val, str) else "")
except Exception:
    print("")
PY
    )"
  fi

  if [[ -n "$current" ]]; then
    echo "skip   $tenant_id  (active_profile=$current already set)"
    count_skipped=$((count_skipped + 1))
    continue
  fi

  action="update"
  if [[ ! -f "$visibility_file" ]]; then
    action="create"
  fi

  if [[ -n "$DRY_RUN" ]]; then
    echo "$action $tenant_id  -> active_profile=$DEFAULT_PROFILE (dry run)"
  else
    python3 - "$visibility_file" "$DEFAULT_PROFILE" <<'PY'
import json, os, sys, tempfile
path, profile = sys.argv[1], sys.argv[2]
try:
    with open(path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    if not isinstance(doc, dict):
        doc = {}
except FileNotFoundError:
    doc = {}
doc["active_profile"] = profile
tmp_fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path) or ".", prefix=".ui-visibility-", suffix=".json")
try:
    with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    os.chmod(tmp_path, 0o600)
    os.replace(tmp_path, path)
except Exception:
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    raise
PY
    echo "$action $tenant_id  -> active_profile=$DEFAULT_PROFILE"
  fi

  if [[ "$action" == "create" ]]; then
    count_created=$((count_created + 1))
  else
    count_updated=$((count_updated + 1))
  fi
done

echo
echo "tenants scanned : $count_seen"
echo "files created   : $count_created"
echo "files updated   : $count_updated"
echo "left untouched  : $count_skipped"
if [[ -n "$DRY_RUN" ]]; then
  echo "(dry run — re-run without DRY_RUN to apply)"
fi
