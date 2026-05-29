#!/bin/sh
# bridge-flow/run.sh — fluxo determinístico Sofia→Catarina.
# Substitui o BRIDGE_CHECK agent_turn que o LLM (claude-cli Sonnet via
# subscription) não conseguia executar — ele alucinava o state em vez
# de chamar a skill onboarding-state. Ver [[project-catarina-tool-call-blocker]].
#
# Executa em ~2s. Saídas:
#   SILENT_NOOP <motivo>             — não devia disparar agora
#   BRIDGE_ERROR <motivo>             — pré-requisito faltando
#   BRIDGE_DISPATCHED area=X phone=Y  — sucesso, WA enviada

set -eu

WORKSPACE="${PICOCLAW_HOME:-/root/.picoclaw}/workspace"
STATE_PY="$WORKSPACE/skills/onboarding-state/scripts/state.py"
SEND_PY="$WORKSPACE/skills/enviar-whatsapp-jotaduo/scripts/send.py"

if [ ! -f "$STATE_PY" ] || [ ! -f "$SEND_PY" ]; then
  echo "BRIDGE_ERROR: skills missing (state=$STATE_PY send=$SEND_PY)"
  exit 1
fi

# 1. Get current state
STATE=$(echo '{"action":"get"}' | python3 "$STATE_PY")
if [ -z "$STATE" ]; then
  echo "BRIDGE_ERROR: onboarding-state get returned empty"
  exit 1
fi

# Extract phase, first_contact_at, owner phone, owner name (one python call)
INFO=$(printf '%s' "$STATE" | python3 -c "
import json, sys
s = json.load(sys.stdin)
print(s.get('phase', ''))
print(s.get('deepening', {}).get('first_contact_at') or '')
o = s.get('owner_captured', {})
print((o.get('whatsapp') or '').lstrip('+'))
print(o.get('name') or 'lá')
")

PHASE=$(printf '%s\n' "$INFO" | sed -n 1p)
FIRST_CONTACT=$(printf '%s\n' "$INFO" | sed -n 2p)
PHONE=$(printf '%s\n' "$INFO" | sed -n 3p)
NAME=$(printf '%s\n' "$INFO" | sed -n 4p)

# 2. SILENT_NOOP gates
case "$PHASE" in
  discovery_done|deepening_in_progress) ;;
  *)
    echo "SILENT_NOOP phase=$PHASE"
    exit 0
    ;;
esac

if [ -n "$FIRST_CONTACT" ]; then
  echo "SILENT_NOOP first_contact_at=$FIRST_CONTACT"
  exit 0
fi

# 3. Pre-conditions for outbound
if [ -z "$PHONE" ]; then
  ERR_JSON=$(python3 - <<'PY'
import json
print(json.dumps({
    "action": "mark_bridge_failed",
    "error": "owner phone missing in state.owner_captured.whatsapp",
}))
PY
)
  echo "$ERR_JSON" | python3 "$STATE_PY" >/dev/null 2>&1 || true
  echo "BRIDGE_ERROR: owner phone missing in state.owner_captured.whatsapp"
  exit 1
fi

# 4. Record a bridge attempt without marking first_contact_at yet. If the
# WhatsApp send fails, the cron must retry instead of treating Catarina as
# already dispatched.
ATTEMPT_RESULT=$(echo '{"action":"mark_bridge_attempt"}' | python3 "$STATE_PY" 2>&1)
if [ $? -ne 0 ]; then
  echo "BRIDGE_ERROR: mark_bridge_attempt failed: $ATTEMPT_RESULT"
  exit 1
fi

# 5. Send opening WhatsApp message (area "equipe" — generic 1st area)
MSG="Oi $NAME, sou a Catarina da Jotaduo. A Sofia ja deixou o painel da empresa pronto. Em sessoes curtas no WhatsApp quero aprofundar — comecando pela equipe: quem atende cliente hoje e quem voce confia pra responder fora do seu horario?"

SEND_RESULT=$(python3 "$SEND_PY" "$PHONE" "$MSG" 2>&1)
SEND_RC=$?
if [ $SEND_RC -ne 0 ]; then
  ERR_JSON=$(BRIDGE_SEND_RC="$SEND_RC" BRIDGE_SEND_RESULT="$SEND_RESULT" python3 - <<'PY'
import json
import os

print(json.dumps({
    "action": "mark_bridge_failed",
    "error": "send.py rc=%s out=%s" % (
        os.environ.get("BRIDGE_SEND_RC", ""),
        os.environ.get("BRIDGE_SEND_RESULT", ""),
    ),
}))
PY
)
  echo "$ERR_JSON" | python3 "$STATE_PY" >/dev/null 2>&1 || true
  echo "BRIDGE_ERROR: send.py rc=$SEND_RC out=$SEND_RESULT"
  exit 1
fi

MARK_RESULT=$(echo '{"action":"mark_first_contact"}' | python3 "$STATE_PY" 2>&1)
if [ $? -ne 0 ]; then
  echo "BRIDGE_ERROR: mark_first_contact failed after send: $MARK_RESULT"
  exit 1
fi

echo "BRIDGE_DISPATCHED area=equipe phone=$PHONE name=$NAME"
echo "send_result=$SEND_RESULT"
