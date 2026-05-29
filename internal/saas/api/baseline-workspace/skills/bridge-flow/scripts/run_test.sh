#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/workspace/skills/onboarding-state/scripts"
mkdir -p "$TMP/workspace/skills/enviar-whatsapp-jotaduo/scripts"

cp "$REPO_ROOT/workspace/skills/onboarding-state/scripts/state.py" \
  "$TMP/workspace/skills/onboarding-state/scripts/state.py"

cat > "$TMP/workspace/skills/enviar-whatsapp-jotaduo/scripts/send.py" <<'PY'
import os
import sys

if os.environ.get("FAIL_SEND") == "1":
    print("send failed intentionally", file=sys.stderr)
    sys.exit(42)

print("sent")
PY
chmod +x "$TMP/workspace/skills/enviar-whatsapp-jotaduo/scripts/send.py"

STATE_PY="$TMP/workspace/skills/onboarding-state/scripts/state.py"
export PICOCLAW_HOME="$TMP"

printf '%s\n' '{"action":"init"}' | python3 "$STATE_PY" >/dev/null
printf '%s\n' '{"action":"set_owner","name":"Ana","email":"ana@example.com","whatsapp":"+5511999999999"}' | python3 "$STATE_PY" >/dev/null
printf '%s\n' '{"action":"mark_discovery_done"}' | python3 "$STATE_PY" >/dev/null

if FAIL_SEND=1 sh "$REPO_ROOT/workspace/skills/bridge-flow/scripts/run.sh" >/tmp/bridge-fail.out 2>&1; then
  echo "expected bridge-flow failure when send.py fails" >&2
  exit 1
fi

first_contact_after_fail="$(python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path(__import__("os").environ["PICOCLAW_HOME"], "workspace/state/onboarding.json").read_text())
print(state["deepening"].get("first_contact_at") or "")
PY
)"
if [ -n "$first_contact_after_fail" ]; then
  echo "first_contact_at was set even though send.py failed: $first_contact_after_fail" >&2
  exit 1
fi

sh "$REPO_ROOT/workspace/skills/bridge-flow/scripts/run.sh" >/tmp/bridge-success.out 2>&1

first_contact_after_success="$(python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path(__import__("os").environ["PICOCLAW_HOME"], "workspace/state/onboarding.json").read_text())
print(state["deepening"].get("first_contact_at") or "")
PY
)"
if [ -z "$first_contact_after_success" ]; then
  echo "first_contact_at was not set after successful send.py" >&2
  exit 1
fi

echo "bridge-flow retry behavior ok"
