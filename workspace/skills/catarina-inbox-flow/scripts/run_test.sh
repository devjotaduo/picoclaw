#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
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
FLOW_PY="$TMP/workspace/skills/catarina-inbox-flow/scripts/run.py"
INBOX="$TMP/workspace/state/jotaduo-wa-inbox.jsonl"

printf '%s\n' '{
  "action":"discovery_close",
  "empresa":"Clínica Aurora Teste",
  "segment":"clinica",
  "summary":"Clínica Aurora Teste: clínica estética com atendimento por WhatsApp.",
  "owner":{"name":"Brendo Final","email":"brendo.final@jotaduo.com","whatsapp":"87988553793"},
  "agentes_recomendados":["clara","camila"],
  "facts":{"canais":["WhatsApp"],"sistemas":["agenda"],"dores":["demora"],"objetivos_90d":["responder rápido"],"agentes_recomendados":["clara","camila"]}
}' | python3 "$STATE_PY" >/dev/null
printf '%s\n' '{"action":"mark_first_contact"}' | python3 "$STATE_PY" >/dev/null

append_inbox() {
  local id="$1"
  local content="$2"
  python3 - "$INBOX" "$id" "$content" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
record = {
    "tenant_id": "brendo7-28d580",
    "from_phone": "87988553793",
    "from_name": "Brendo Final",
    "content": sys.argv[3],
    "chat_jid": "87988553793@s.whatsapp.net",
    "message_id": sys.argv[2],
    "timestamp": 1779990000,
    "sent_at": 1779990000,
}
path.parent.mkdir(parents=True, exist_ok=True)
with path.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record, ensure_ascii=False) + "\n")
PY
}

run_flow() {
  local out="$1"
  python3 "$FLOW_PY" >"$out"
}

append_inbox "m-catarina-weak-1" "ok"
run_flow /tmp/catarina-inbox-flow-weak.out

grep -q 'INBOX_CLARIFY area=equipe reason=weak_reply' /tmp/catarina-inbox-flow-weak.out
grep -q 'mais de detalhe sobre a equipe' "$TMP/workspace/state/sent.jsonl"

python3 - <<'PY'
import json
import os
from pathlib import Path

home = Path(os.environ["PICOCLAW_HOME"])
state = json.loads((home / "workspace/state/onboarding.json").read_text(encoding="utf-8"))
assert state["deepening"]["areas_covered"] == [], state
records = [
    json.loads(line)
    for line in (home / "workspace/state/catarina-deepening.jsonl").read_text(encoding="utf-8").splitlines()
]
assert len(records) == 1, records
assert records[0]["area"] == "equipe", records
assert records[0]["satisfactory"] is False, records
assert records[0]["content"] == "ok", records
PY

append_inbox "m-catarina-equipe-2" "Na equipe, Brendo aprova excecoes e valores; Ana atende WhatsApp durante horario comercial; Pedro confirma agenda e chama Brendo quando existe pedido fora do padrao ou reclamacao sensivel."
run_flow /tmp/catarina-inbox-flow-equipe.out
grep -q 'INBOX_DISPATCHED completed=equipe next=casos-excecao' /tmp/catarina-inbox-flow-equipe.out

append_inbox "m-catarina-casos-3" "Caso de excecao comum: cliente quer remarcar procedimento no mesmo dia ou pede reembolso depois de comprar pacote. Ana coleta motivo, Pedro checa agenda e Brendo decide se aprova encaixe, credito ou reembolso."
run_flow /tmp/catarina-inbox-flow-casos.out
grep -q 'INBOX_DISPATCHED completed=casos-excecao next=faq' /tmp/catarina-inbox-flow-casos.out

append_inbox "m-catarina-faq-4" "Duvidas frequentes: preco do botox e preenchimento, preparo antes da limpeza de pele, formas de pagamento Pix/cartao e quanto tempo dura cada procedimento. Responder sempre com valor quando existir e oferecer avaliacao."
run_flow /tmp/catarina-inbox-flow-faq.out
grep -q 'INBOX_DISPATCHED completed=faq next=historico' /tmp/catarina-inbox-flow-faq.out

append_inbox "m-catarina-historico-5" "Um caso que deu errado: paciente marcou avaliacao pelo Instagram, ninguem confirmou no WhatsApp e ela faltou. Resolvemos pedindo desculpa, oferecendo novo horario e criando regra de confirmar todo agendamento no dia anterior."
run_flow /tmp/catarina-inbox-flow-historico.out
grep -q 'INBOX_DISPATCHED completed=historico next=regras-tacitas' /tmp/catarina-inbox-flow-historico.out

append_inbox "m-catarina-regras-6" "Regras tacitas: nunca prometer resultado estetico garantido, sempre avisar preparo e contraindicações, prioridade para remarcacao de paciente que ja pagou pacote, e duvida clinica sensivel deve ir para Brendo antes da resposta final."
run_flow /tmp/catarina-inbox-flow-regras.out
grep -q 'INBOX_DONE completed=regras-tacitas' /tmp/catarina-inbox-flow-regras.out

python3 - <<'PY'
import json
import os
from pathlib import Path

home = Path(os.environ["PICOCLAW_HOME"])
state = json.loads((home / "workspace/state/onboarding.json").read_text(encoding="utf-8"))
required = ["equipe", "casos-excecao", "faq", "historico", "regras-tacitas"]
assert state["phase"] == "ready_for_promotion", state
assert state["promotion"]["ready"] is True, state
assert state["promotion"]["blocked_by"] == [], state
assert state["deepening"]["areas_covered"] == required, state

records = [
    json.loads(line)
    for line in (home / "workspace/state/catarina-deepening.jsonl").read_text(encoding="utf-8").splitlines()
]
assert len(records) == 6, records
assert sum(1 for record in records if record["satisfactory"]) == 5, records

memory = (home / "workspace/memory/aprofundamento-catarina.md").read_text(encoding="utf-8")
for title in ("## Equipe", "## Casos De Excecao", "## Duvidas Frequentes", "## Historico De Problemas", "## Regras Tacitas"):
    assert title in memory, memory
assert "ok" not in memory, memory
PY

echo "catarina-inbox-flow ok"
