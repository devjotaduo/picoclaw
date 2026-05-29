#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/workspace/skills/onboarding-state/scripts"
mkdir -p "$TMP/workspace/skills/verificar-respostas-jotaduo/scripts"
mkdir -p "$TMP/workspace/skills/catarina-inbox-flow/scripts"
mkdir -p "$TMP/workspace/skills/enviar-whatsapp-jotaduo/scripts"
mkdir -p "$TMP/workspace/state"

cp "$REPO_ROOT/workspace/skills/onboarding-state/scripts/state.py" \
  "$TMP/workspace/skills/onboarding-state/scripts/state.py"
cp "$REPO_ROOT/workspace/skills/verificar-respostas-jotaduo/scripts/check-inbox.py" \
  "$TMP/workspace/skills/verificar-respostas-jotaduo/scripts/check-inbox.py"
cp "$REPO_ROOT/workspace/skills/catarina-inbox-flow/scripts/run.py" \
  "$TMP/workspace/skills/catarina-inbox-flow/scripts/run.py"

cat > "$TMP/workspace/skills/enviar-whatsapp-jotaduo/scripts/send.py" <<'PY'
import json
import os
import sys
from pathlib import Path

Path(os.environ["PICOCLAW_HOME"], "workspace/state/sent.jsonl").open("a", encoding="utf-8").write(
    json.dumps({"phone": sys.argv[1], "message": " ".join(sys.argv[2:])}, ensure_ascii=False) + "\n"
)
print('{"status":"sent"}')
PY

touch "$TMP/workspace/AGENT.md"
export PICOCLAW_HOME="$TMP"
STATE_PY="$TMP/workspace/skills/onboarding-state/scripts/state.py"

printf '%s\n' '{"action":"init"}' | python3 "$STATE_PY" >/dev/null
printf '%s\n' '{"action":"set_owner","name":"Ana","email":"ana@example.com","whatsapp":"+5511999999999"}' | python3 "$STATE_PY" >/dev/null
printf '%s\n' '{"action":"mark_discovery_done","segment":"servicos","summary":"ok"}' | python3 "$STATE_PY" >/dev/null
printf '%s\n' '{"action":"mark_first_contact"}' | python3 "$STATE_PY" >/dev/null

cat > "$TMP/workspace/state/jotaduo-wa-inbox.jsonl" <<'JSONL'
{"tenant_id":"t1","from_phone":"5511999999999","from_name":"Ana","content":"A Ana e o Pedro atendem, eu fico nos casos fora do horario.","chat_jid":"5511999999999@s.whatsapp.net","message_id":"m1","timestamp":1779990000,"sent_at":1779990000}
JSONL

python3 "$TMP/workspace/skills/catarina-inbox-flow/scripts/run.py" >/tmp/catarina-inbox-flow.out

grep -q 'INBOX_DISPATCHED completed=equipe next=casos-excecao' /tmp/catarina-inbox-flow.out
grep -q 'casos de excecao' "$TMP/workspace/state/sent.jsonl"

python3 - <<'PY'
import json
import os
from pathlib import Path

home = Path(os.environ["PICOCLAW_HOME"])
state = json.loads((home / "workspace/state/onboarding.json").read_text(encoding="utf-8"))
assert "equipe" in state["deepening"]["areas_covered"], state
assert state["deepening"]["last_owner_response_at"], state
assert state["deepening"]["last_outreach_at"], state
assert (home / "workspace/state/jotaduo-wa-inbox.pointer").read_text(encoding="utf-8").strip() != "0"
PY

echo "catarina-inbox-flow ok"
