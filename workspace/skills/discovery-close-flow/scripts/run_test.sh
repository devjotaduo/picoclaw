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
mkdir -p "$TMP/workspace/skills/jotaduo-discovery/scripts"
mkdir -p "$TMP/workspace/memory" "$TMP/workspace/state"
printf '# Test AGENT\n' > "$TMP/workspace/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$TMP/workspace/memory/empresa.md"
cp "$REPO_ROOT/workspace/skills/onboarding-state/scripts/state.py" \
  "$TMP/workspace/skills/onboarding-state/scripts/state.py"
cp "$REPO_ROOT/workspace/skills/jotaduo-discovery/scripts/save_client.py" \
  "$TMP/workspace/skills/jotaduo-discovery/scripts/save_client.py"

export PICOCLAW_HOME="$TMP"

NO_REQUEST_OUT="$(python3 "$SCRIPT_DIR/run.py")"
if [ "$NO_REQUEST_OUT" != "SILENT_NOOP no_request" ]; then
  echo "unexpected no-request output: $NO_REQUEST_OUT" >&2
  exit 1
fi

printf '{"action":"discovery_close","empresa":"Sem Dono"}\n' > "$TMP/workspace/state/discovery-close.request.json"
if python3 "$SCRIPT_DIR/run.py" >/tmp/discovery-close-invalid.out 2>&1; then
  echo "expected invalid request to fail" >&2
  exit 1
fi
if [ ! -f "$TMP/workspace/state/discovery-close.request.error.json" ]; then
  echo "invalid request was not archived as .error" >&2
  exit 1
fi
if ! grep -q "CLOSE_ERROR:" /tmp/discovery-close-invalid.out; then
  echo "invalid request did not report CLOSE_ERROR" >&2
  cat /tmp/discovery-close-invalid.out >&2
  exit 1
fi

cat > "$TMP/workspace/state/discovery-close.request.json" <<'JSON'
{
  "action": "discovery_close",
  "empresa": "Café Norte Teste5",
  "segment": "restaurante",
  "summary": "Resumo executivo validado pelo dono.",
  "owner": {
    "name": "Bruno Teste5",
    "email": "bruno.teste5@jotaduo.com",
    "whatsapp": "87988553793"
  },
  "facts": {
    "canais": ["WhatsApp", "Instagram"],
    "sistemas": ["cardápio em PDF", "planilha de pedidos", "Pix"],
    "dores": ["demora para responder", "pedidos esquecidos"],
    "objetivos_90d": ["responder em até 2 minutos", "aumentar recompra"],
    "agentes_recomendados": ["Clara", "Luna", "Camila"]
  },
  "captured_by": "sofia"
}
JSON

VALID_OUT="$(python3 "$SCRIPT_DIR/run.py")"
if ! printf '%s' "$VALID_OUT" | grep -q "DISCOVERY_CLOSED email=bruno.teste5@jotaduo.com"; then
  echo "valid request did not close discovery: $VALID_OUT" >&2
  exit 1
fi
if [ ! -f "$TMP/workspace/state/discovery-close.request.done.json" ]; then
  echo "valid request was not archived as .done" >&2
  exit 1
fi

python3 - <<'PY'
import json
import os
from pathlib import Path

ws = Path(os.environ["PICOCLAW_HOME"]) / "workspace"
state = json.loads((ws / "state/onboarding.json").read_text(encoding="utf-8"))
empresa = (ws / "memory/empresa.md").read_text(encoding="utf-8")
if not state["discovery"].get("completed_at"):
    raise SystemExit("discovery was not marked done")
if any("empresa_memory_empty" in item for item in state["promotion"]["blocked_by"]):
    raise SystemExit(f"empresa blocker still present: {state['promotion']['blocked_by']}")
if "Nome: Café Norte Teste5" not in empresa:
    raise SystemExit(f"empresa.md not filled:\n{empresa}")
PY

cp "$TMP/workspace/state/discovery-close.request.done.json" "$TMP/workspace/state/discovery-close.request.json"
ALREADY_OUT="$(python3 "$SCRIPT_DIR/run.py")"
if [ "$ALREADY_OUT" != "DISCOVERY_ALREADY_DONE" ]; then
  echo "unexpected already-done output: $ALREADY_OUT" >&2
  exit 1
fi

COMPAT_HOME="$TMP/compat"
mkdir -p "$COMPAT_HOME/workspace/skills/onboarding-state/scripts"
mkdir -p "$COMPAT_HOME/workspace/skills/jotaduo-discovery/scripts"
mkdir -p "$COMPAT_HOME/workspace/memory" "$COMPAT_HOME/workspace/state"
printf '# Test AGENT\n' > "$COMPAT_HOME/workspace/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$COMPAT_HOME/workspace/memory/empresa.md"
cp "$REPO_ROOT/workspace/skills/onboarding-state/scripts/state.py" \
  "$COMPAT_HOME/workspace/skills/onboarding-state/scripts/state.py"
cp "$REPO_ROOT/workspace/skills/jotaduo-discovery/scripts/save_client.py" \
  "$COMPAT_HOME/workspace/skills/jotaduo-discovery/scripts/save_client.py"
cat > "$COMPAT_HOME/workspace/state/discovery-close.request.json" <<'JSON'
{
  "action": "discovery_close",
  "name": "Ana Compat",
  "email": "ana.compat@jotaduo.com",
  "whatsapp": "87988553793",
  "segment": "clinica",
  "summary": "Clínica Compat: clínica de estética com agendamento por WhatsApp.",
  "captured_by": "sofia"
}
JSON
PICOCLAW_HOME="$COMPAT_HOME" python3 "$SCRIPT_DIR/run.py" >/tmp/discovery-close-compat.out
if ! grep -q "DISCOVERY_CLOSED email=ana.compat@jotaduo.com" /tmp/discovery-close-compat.out; then
  echo "legacy-shaped request did not close discovery" >&2
  cat /tmp/discovery-close-compat.out >&2
  exit 1
fi
if ! grep -q "Nome: Clínica Compat" "$COMPAT_HOME/workspace/memory/empresa.md"; then
  echo "legacy-shaped request did not infer empresa from summary" >&2
  cat "$COMPAT_HOME/workspace/memory/empresa.md" >&2
  exit 1
fi

echo "discovery-close-flow behavior ok"
