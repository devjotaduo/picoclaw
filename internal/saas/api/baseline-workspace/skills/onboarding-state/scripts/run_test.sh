#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$(cd "$SCRIPT_DIR/../../tenant-liberation/scripts" && pwd)/validate_workspace.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

WS="$TMP/workspace"
mkdir -p "$WS/skills/onboarding-state/scripts" "$WS/memory"
printf '# Test AGENT\n' > "$WS/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$WS/memory/empresa.md"
cp "$SCRIPT_DIR/state.py" "$WS/skills/onboarding-state/scripts/state.py"
STATE_PY="$WS/skills/onboarding-state/scripts/state.py"

printf '%s\n' \
  '{"action":"set_owner","name":"Carla Teste3","email":"carla.teste3@jotaduo.com","whatsapp":"87988553793","captured_by":"sofia"}' \
  | python3 "$STATE_PY" >/dev/null

OUT="$(
  printf '%s\n' \
    '{"action":"mark_discovery_done","segment":"clinica","summary":"Studio Viva Teste3: estúdio de pilates e fisioterapia. Canais: WhatsApp e Instagram. Sistemas: Google Agenda + planilhas + Pix."}' \
    | python3 "$STATE_PY"
)"

VALIDATION="$(python3 "$VALIDATOR" --workspace "$WS" --json)"

python3 - "$WS" "$OUT" "$VALIDATION" <<'PY'
import json
import sys
from pathlib import Path

ws = Path(sys.argv[1])
state = json.loads(sys.argv[2])
validation = json.loads(sys.argv[3])
empresa = (ws / "memory" / "empresa.md").read_text(encoding="utf-8")

required = [
    "Nome: Studio Viva Teste3",
    "Segmento: saude",
    "Email: carla.teste3@jotaduo.com",
    "WhatsApp: 87988553793",
    "Segmento detectado: saude",
]
missing = [item for item in required if item not in empresa]
if missing:
    raise SystemExit(f"empresa.md missing expected fields: {missing}\n{empresa}")
if "Status: pendente de validação" in empresa:
    raise SystemExit("empresa.md kept pending template marker")
if any("empresa_memory_empty" in item for item in state["promotion"]["blocked_by"]):
    raise SystemExit(f"state still blocked by empresa memory: {state['promotion']['blocked_by']}")
if not validation.get("ok"):
    raise SystemExit(f"tenant-liberation validation failed: {validation}")
if validation.get("missing_summary"):
    raise SystemExit(f"tenant-liberation reported missing fields: {validation['missing_summary']}")
print("OK onboarding-state syncs discovery data into memory/empresa.md and tenant-liberation validates it")
PY
