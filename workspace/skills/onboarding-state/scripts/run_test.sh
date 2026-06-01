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

WS2="$TMP/discovery-close/workspace"
mkdir -p "$WS2/skills/onboarding-state/scripts" "$WS2/skills/jotaduo-discovery/scripts" "$WS2/memory" "$WS2/state"
printf '# Test AGENT\n' > "$WS2/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$WS2/memory/empresa.md"
cp "$SCRIPT_DIR/state.py" "$WS2/skills/onboarding-state/scripts/state.py"
cp "$SCRIPT_DIR/../../jotaduo-discovery/scripts/save_client.py" "$WS2/skills/jotaduo-discovery/scripts/save_client.py"
STATE_PY2="$WS2/skills/onboarding-state/scripts/state.py"
CLOSE_PAYLOAD="$WS2/state/discovery-close.request.json"
cat > "$CLOSE_PAYLOAD" <<'JSON'
{
  "action": "discovery_close",
  "empresa": "Café Norte Teste5",
  "segment": "restaurante",
  "summary": "Resumo executivo validado pelo dono: restaurante com atendimento via WhatsApp e Instagram, cardápio em PDF, planilha de pedidos e Pix.",
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

OUT2="$(python3 "$STATE_PY2" --payload-file "$CLOSE_PAYLOAD")"
VALIDATION2="$(python3 "$VALIDATOR" --workspace "$WS2" --json || true)"

python3 - "$WS2" "$OUT2" "$VALIDATION2" <<'PY'
import json
import sys
from pathlib import Path

ws = Path(sys.argv[1])
state = json.loads(sys.argv[2])
validation = json.loads(sys.argv[3])
state_file = ws / "state" / "onboarding.json"
empresa = (ws / "memory" / "empresa.md").read_text(encoding="utf-8")

if not state_file.is_file():
    raise SystemExit("discovery_close did not create state/onboarding.json")
if state["owner_captured"]["name"] != "Bruno Teste5":
    raise SystemExit(f"owner name not captured: {state['owner_captured']}")
if state["owner_captured"]["email"] != "bruno.teste5@jotaduo.com":
    raise SystemExit(f"owner email not captured: {state['owner_captured']}")
if state["owner_captured"]["whatsapp"] != "87988553793":
    raise SystemExit(f"owner whatsapp not captured: {state['owner_captured']}")
if not state["discovery"].get("completed_at"):
    raise SystemExit(f"discovery.completed_at missing: {state['discovery']}")
if state["discovery"].get("agentes_recomendados") != ["clara", "luna", "camila"]:
    raise SystemExit(f"recommended agents not normalized into discovery: {state['discovery']}")
if any("empresa_memory_empty" in item for item in state["promotion"]["blocked_by"]):
    raise SystemExit(f"empresa memory blocker still present: {state['promotion']['blocked_by']}")
if "agents_not_recommended" in state["promotion"]["blocked_by"]:
    raise SystemExit(f"agents_not_recommended should be cleared: {state['promotion']['blocked_by']}")

required = [
    "# Empresa",
    "Status: validado pelo dono em ",
    "Nome: Café Norte Teste5",
    "Segmento: restaurante",
    "Contato email: bruno.teste5@jotaduo.com",
    "Contato WhatsApp: 87988553793",
    "## Resumo",
    "Resumo executivo validado pelo dono",
    "## Canais",
    "- WhatsApp",
    "- Instagram",
    "## Sistemas atuais",
    "- cardápio em PDF",
    "## Dores priorizadas",
    "- demora para responder",
    "## Objetivos 90 dias",
    "- responder em até 2 minutos",
]
missing = [item for item in required if item not in empresa]
if missing:
    raise SystemExit(f"empresa.md missing discovery_close fields: {missing}\n{empresa}")
if "Status: pendente de validação" in empresa:
    raise SystemExit("discovery_close kept pending template marker")
if validation.get("universal") != {
    "nome": True,
    "segmento": True,
    "contato_email": True,
    "contato_whatsapp": True,
}:
    raise SystemExit(f"tenant-liberation universal fields not ready: {validation}")

client_dir = ws / "memory" / "jotaduo" / "clientes"
if not (client_dir / "cafe-norte-teste5.json").is_file():
    raise SystemExit(f"dossier json not written in {client_dir}")
if not (client_dir / "cafe-norte-teste5.md").is_file():
    raise SystemExit(f"dossier markdown not written in {client_dir}")
print("OK discovery_close atomically writes state, empresa.md and client dossier")
PY

WS2_COMPAT="$TMP/discovery-close-compat/workspace"
mkdir -p "$WS2_COMPAT/skills/onboarding-state/scripts" "$WS2_COMPAT/memory" "$WS2_COMPAT/state"
printf '# Test AGENT\n' > "$WS2_COMPAT/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$WS2_COMPAT/memory/empresa.md"
cp "$SCRIPT_DIR/state.py" "$WS2_COMPAT/skills/onboarding-state/scripts/state.py"
STATE_PY2_COMPAT="$WS2_COMPAT/skills/onboarding-state/scripts/state.py"
cat > "$WS2_COMPAT/state/discovery-close-compat.json" <<'JSON'
{
  "action": "discovery_close",
  "name": "Ana Compat",
  "email": "ana.compat@example.com",
  "whatsapp": "87988553793",
  "segment": "clinica",
  "summary": "Clínica Compat: clínica de estética com agendamento por WhatsApp.",
  "captured_by": "sofia"
}
JSON

OUT2_COMPAT="$(python3 "$STATE_PY2_COMPAT" --payload-file "$WS2_COMPAT/state/discovery-close-compat.json")"
python3 - "$WS2_COMPAT" "$OUT2_COMPAT" <<'PY'
import json
import sys
from pathlib import Path

ws = Path(sys.argv[1])
state = json.loads(sys.argv[2])
empresa = (ws / "memory" / "empresa.md").read_text(encoding="utf-8")

if state["owner_captured"]["email"] != "ana.compat@example.com":
    raise SystemExit(f"compat owner not captured: {state['owner_captured']}")
if any("empresa_memory_empty" in item for item in state["promotion"]["blocked_by"]):
    raise SystemExit(f"compat empresa memory blocker still present: {state['promotion']['blocked_by']}")
if "agents_not_recommended" not in state["promotion"]["blocked_by"]:
    raise SystemExit(f"compat payload without recommendations should keep soft blocker: {state['promotion']['blocked_by']}")
if "Nome: Clínica Compat" not in empresa:
    raise SystemExit(f"compat empresa name not inferred from summary:\n{empresa}")
print("OK discovery_close accepts legacy flat payload with company in summary")
PY

WS2_NORMALIZE="$TMP/discovery-close-recommended/workspace"
mkdir -p "$WS2_NORMALIZE/skills/onboarding-state/scripts" "$WS2_NORMALIZE/memory" "$WS2_NORMALIZE/state"
printf '# Test AGENT\n' > "$WS2_NORMALIZE/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$WS2_NORMALIZE/memory/empresa.md"
cp "$SCRIPT_DIR/state.py" "$WS2_NORMALIZE/skills/onboarding-state/scripts/state.py"
STATE_PY2_NORMALIZE="$WS2_NORMALIZE/skills/onboarding-state/scripts/state.py"
cat > "$WS2_NORMALIZE/state/discovery-close-recommended.json" <<'JSON'
{
  "action": "discovery_close",
  "empresa": "Studio Viva Recomendados",
  "segment": "clinica",
  "summary": "Studio Viva Recomendados: clínica com recepção sobrecarregada e rotina de retorno por WhatsApp.",
  "owner": {
    "name": "Carla Recomendada",
    "email": "carla.recomendada@example.com",
    "whatsapp": "87988553793"
  },
  "facts": {
    "agentes_recomendados": ["Clara", "Luna", "Rafael", "agente-cobranca", "clara"]
  },
  "captured_by": "sofia"
}
JSON

OUT2_NORMALIZE="$(python3 "$STATE_PY2_NORMALIZE" --payload-file "$WS2_NORMALIZE/state/discovery-close-recommended.json")"
python3 - "$OUT2_NORMALIZE" <<'PY'
import json
import sys

state = json.loads(sys.argv[1])
got = state["discovery"].get("agentes_recomendados")
if got != ["clara", "luna", "main"]:
    raise SystemExit(f"recommended agents normalization mismatch: {got}")
if "agents_not_recommended" in state["promotion"]["blocked_by"]:
    raise SystemExit(f"recommended agents soft blocker was not cleared: {state['promotion']['blocked_by']}")
print("OK discovery_close normalizes recommended agents into onboarding.json")
PY

WS2_FORCE="$TMP/discovery-close-force/workspace"
mkdir -p "$WS2_FORCE/skills/onboarding-state/scripts" "$WS2_FORCE/memory" "$WS2_FORCE/state"
printf '# Test AGENT\n' > "$WS2_FORCE/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$WS2_FORCE/memory/empresa.md"
cp "$SCRIPT_DIR/state.py" "$WS2_FORCE/skills/onboarding-state/scripts/state.py"
STATE_PY2_FORCE="$WS2_FORCE/skills/onboarding-state/scripts/state.py"
cat > "$WS2_FORCE/state/discovery-close-force.json" <<'JSON'
{
  "action": "discovery_close",
  "empresa": "Studio Viva Force",
  "segment": "clinica",
  "summary": "Studio Viva Force: clínica simples com atendimento via WhatsApp.",
  "owner": {
    "name": "Carla Force",
    "email": "carla.force@example.com",
    "whatsapp": "87988553793"
  },
  "captured_by": "sofia"
}
JSON

python3 "$STATE_PY2_FORCE" --payload-file "$WS2_FORCE/state/discovery-close-force.json" >/dev/null
OUT2_FORCE="$(
  printf '%s\n' \
    '{"action":"mark_ready_for_promotion","reason":"admin revisou tenant legado sem recomendacao estruturada"}' \
    | python3 "$STATE_PY2_FORCE"
)"
python3 - "$OUT2_FORCE" <<'PY'
import json
import sys

state = json.loads(sys.argv[1])
if "agents_not_recommended" in state["promotion"]["blocked_by"]:
    raise SystemExit(f"admin escape hatch did not clear agents_not_recommended: {state['promotion']['blocked_by']}")
if not state["promotion"].get("ready"):
    raise SystemExit(f"admin escape hatch should make promotion ready: {state['promotion']}")
print("OK admin escape hatch clears agents_not_recommended soft blocker")
PY

WS3="$TMP/invalid/workspace"
mkdir -p "$WS3/skills/onboarding-state/scripts" "$WS3/memory" "$WS3/state"
printf '# Test AGENT\n' > "$WS3/AGENT.md"
printf '# Empresa\n\nStatus: pendente de validação\n' > "$WS3/memory/empresa.md"
cp "$SCRIPT_DIR/state.py" "$WS3/skills/onboarding-state/scripts/state.py"
STATE_PY3="$WS3/skills/onboarding-state/scripts/state.py"

cat > "$WS3/state/bad-email.json" <<'JSON'
{
  "action": "discovery_close",
  "empresa": "Café Norte Teste5",
  "segment": "restaurante",
  "summary": "Resumo validado.",
  "owner": {"name": "Bruno", "email": "email-invalido", "whatsapp": "87988553793"}
}
JSON
if python3 "$STATE_PY3" --payload-file "$WS3/state/bad-email.json" >/tmp/discovery-close-bad-email.out 2>&1; then
  echo "expected discovery_close to reject invalid email" >&2
  exit 1
fi
if ! grep -q "email inválido" /tmp/discovery-close-bad-email.out; then
  echo "invalid email rejection did not mention email inválido" >&2
  cat /tmp/discovery-close-bad-email.out >&2
  exit 1
fi

cat > "$WS3/state/bad-whatsapp.json" <<'JSON'
{
  "action": "discovery_close",
  "empresa": "Café Norte Teste5",
  "segment": "restaurante",
  "summary": "Resumo validado.",
  "owner": {"name": "Bruno", "email": "bruno@example.com", "whatsapp": "12345"}
}
JSON
if python3 "$STATE_PY3" --payload-file "$WS3/state/bad-whatsapp.json" >/tmp/discovery-close-bad-whatsapp.out 2>&1; then
  echo "expected discovery_close to reject short whatsapp" >&2
  exit 1
fi
if ! grep -q "whatsapp tem" /tmp/discovery-close-bad-whatsapp.out; then
  echo "short whatsapp rejection did not mention whatsapp length" >&2
  cat /tmp/discovery-close-bad-whatsapp.out >&2
  exit 1
fi

echo "OK discovery_close rejects invalid owner payloads"
