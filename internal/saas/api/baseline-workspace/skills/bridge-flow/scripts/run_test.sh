#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
find_repo_root() {
  cur="$SCRIPT_DIR"
  while [ "$cur" != "/" ]; do
    if [ -f "$cur/workspace/skills/onboarding-state/scripts/state.py" ]; then
      printf '%s\n' "$cur"
      return 0
    fi
    cur="$(dirname "$cur")"
  done
  return 1
}
REPO_ROOT="$(find_repo_root)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/workspace/skills/onboarding-state/scripts"
mkdir -p "$TMP/workspace/skills/enviar-whatsapp-jotaduo/scripts"
mkdir -p "$TMP/workspace/skills/jotaduo-discovery/scripts"
mkdir -p "$TMP/workspace/memory"

cp "$REPO_ROOT/workspace/skills/onboarding-state/scripts/state.py" \
  "$TMP/workspace/skills/onboarding-state/scripts/state.py"
cp "$REPO_ROOT/workspace/skills/jotaduo-discovery/scripts/save_client.py" \
  "$TMP/workspace/skills/jotaduo-discovery/scripts/save_client.py"

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
printf '%s\n' '{"action":"set_owner","name":"Ana","email":"ana@example.com"}' | python3 "$STATE_PY" >/dev/null
printf '%s\n' '{"action":"mark_discovery_done"}' | python3 "$STATE_PY" >/dev/null
cat > "$TMP/workspace/memory/empresa.md" <<'MD'
# Empresa

Nome: Studio Viva Teste3
Segmento: clinica
Contato email: ana@example.com
MD
printf '%s\n' '{"action":"get"}' | python3 "$STATE_PY" >/dev/null

if sh "$REPO_ROOT/workspace/skills/bridge-flow/scripts/run.sh" >/tmp/bridge-no-phone.out 2>&1; then
  echo "expected bridge-flow failure when owner whatsapp is missing" >&2
  exit 1
fi

missing_phone_error="$(python3 - <<'PY'
import json
from pathlib import Path
state = json.loads(Path(__import__("os").environ["PICOCLAW_HOME"], "workspace/state/onboarding.json").read_text())
print(state["deepening"].get("last_bridge_error") or "")
PY
)"
if ! printf '%s' "$missing_phone_error" | grep -q "owner phone missing"; then
  echo "missing phone bridge error was not persisted: $missing_phone_error" >&2
  exit 1
fi

printf '%s\n' '{"action":"set_owner","name":"Ana","email":"ana@example.com","whatsapp":"+5511999999999"}' | python3 "$STATE_PY" >/dev/null
printf '# Empresa\n\nStatus: pendente de validação\n' > "$TMP/workspace/memory/empresa.md"
printf '%s\n' '{"action":"get"}' | python3 "$STATE_PY" >/dev/null

sh "$REPO_ROOT/workspace/skills/bridge-flow/scripts/run.sh" >/tmp/bridge-empty-memory.out 2>&1
if ! grep -q "SILENT_NOOP empresa_memory_empty" /tmp/bridge-empty-memory.out; then
  echo "expected bridge-flow to no-op while empresa.md is empty" >&2
  cat /tmp/bridge-empty-memory.out >&2
  exit 1
fi

cat > "$TMP/workspace/state/discovery-close.request.json" <<'JSON'
{
  "action": "discovery_close",
  "empresa": "Studio Viva Teste3",
  "segment": "clinica",
  "summary": "Studio Viva Teste3: estúdio de pilates e fisioterapia. Canais: WhatsApp e Instagram.",
  "owner": {
    "name": "Ana",
    "email": "ana@example.com",
    "whatsapp": "+5511999999999"
  },
  "facts": {
    "canais": ["WhatsApp", "Instagram"],
    "sistemas": ["Google Agenda", "planilhas", "Pix"],
    "dores": ["demora para responder"],
    "objetivos_90d": ["responder em até 2 minutos"],
    "agentes_recomendados": ["Clara", "Catarina"]
  },
  "captured_by": "sofia"
}
JSON
python3 "$STATE_PY" --payload-file "$TMP/workspace/state/discovery-close.request.json" >/dev/null

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
