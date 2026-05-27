#!/usr/bin/env python3
"""onboarding-state — state machine para workspace/state/onboarding.json.

Lê uma ação JSON do stdin, lê/escreve o arquivo de estado no volume do
tenant, devolve o estado resultante (ou erro estruturado) no stdout.

Caminho do arquivo: <workspace_root>/state/onboarding.json
Onde workspace_root é detectado subindo da localização do próprio script
até achar um dir com `AGENT.md` (heurística que funciona em tenant volumes
em /root/.picoclaw/workspace e em dev local em c:/.../workspace).
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


VALID_AREAS = {"equipe", "casos-excecao", "faq", "historico", "regras-tacitas"}
VALID_PHASES = {
    "discovery_in_progress",
    "discovery_done",
    "deepening_in_progress",
    "ready_for_promotion",
    "promoted",
}
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
# Brazilian-friendly: +55 11 99999-8888 / 11999998888 / etc. Strip non-digits then check length.
WHATSAPP_DIGITS_MIN = 10  # 10 sem DDI; agente normaliza pra +55 depois


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def find_workspace_root(start: Path) -> Path:
    """Sobe diretórios procurando um que tenha AGENT.md. Fallback: $PICOCLAW_HOME/workspace."""
    cur = start.resolve()
    for parent in [cur, *cur.parents]:
        if (parent / "AGENT.md").is_file() and parent.name.lower() == "workspace":
            return parent
    # Fallback: olhar PICOCLAW_HOME env
    import os
    home = os.environ.get("PICOCLAW_HOME")
    if home:
        candidate = Path(home) / "workspace"
        if candidate.is_dir():
            return candidate
    raise SystemExit("could not find workspace root (no AGENT.md found walking up + PICOCLAW_HOME unset)")


def empty_state() -> dict:
    return {
        "phase": "discovery_in_progress",
        "discovery": {
            "started_at": now_iso(),
            "completed_at": None,
            "segment": None,
            "summary": None,
            "agent": "sofia",
        },
        "deepening": {
            "started_at": None,
            "first_contact_at": None,
            "areas_covered": [],
            "areas_required": sorted(VALID_AREAS),
            "completed_at": None,
            "agent": "catarina",
        },
        "owner_captured": {
            "name": None,
            "email": None,
            "whatsapp": None,
            "captured_by": None,
            "captured_at": None,
        },
        "promotion": {
            "ready": False,
            "blocked_by": ["discovery_incomplete"],
            "promoted_at": None,
            "promoted_by": None,
        },
    }


def load_state(path: Path) -> dict:
    if not path.is_file():
        return empty_state()
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"onboarding.json corrupted: {e}")


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def recompute_phase_and_blockers(state: dict) -> None:
    """Recalcula state.phase e state.promotion.blocked_by depois de qualquer mutação."""
    blocked: list[str] = []

    if state["discovery"]["completed_at"] is None:
        blocked.append("discovery_incomplete")

    if not state["owner_captured"]["email"]:
        blocked.append("owner_email_missing")

    covered = set(state["deepening"]["areas_covered"])
    required = set(state["deepening"]["areas_required"])
    if not required.issubset(covered):
        missing = sorted(required - covered)
        blocked.append(f"deepening_incomplete: {','.join(missing)}")

    state["promotion"]["blocked_by"] = blocked
    state["promotion"]["ready"] = (
        not blocked and state["promotion"]["promoted_at"] is None
    )

    # Phase derivation
    if state["promotion"]["promoted_at"]:
        state["phase"] = "promoted"
    elif state["promotion"]["ready"]:
        state["phase"] = "ready_for_promotion"
    elif state["deepening"]["areas_covered"]:
        state["phase"] = "deepening_in_progress"
    elif state["discovery"]["completed_at"]:
        state["phase"] = "discovery_done"
    else:
        state["phase"] = "discovery_in_progress"


def op_init(state: dict, payload: dict) -> dict:
    # init é idempotente. Se já existe, retorna o atual.
    return state


def op_set_owner(state: dict, payload: dict) -> dict:
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    whatsapp = (payload.get("whatsapp") or "").strip()
    captured_by = payload.get("captured_by") or "sofia"

    if not email:
        raise SystemExit("set_owner: email is required")
    if not EMAIL_RE.match(email):
        raise SystemExit(f"set_owner: email inválido: {email!r}")
    if whatsapp:
        digits = re.sub(r"\D", "", whatsapp)
        if len(digits) < WHATSAPP_DIGITS_MIN:
            raise SystemExit(
                f"set_owner: whatsapp tem {len(digits)} dígitos, mínimo {WHATSAPP_DIGITS_MIN}"
            )

    state["owner_captured"] = {
        "name": name or None,
        "email": email,
        "whatsapp": whatsapp or None,
        "captured_by": captured_by,
        "captured_at": now_iso(),
    }
    return state


def op_mark_discovery_done(state: dict, payload: dict) -> dict:
    segment = (payload.get("segment") or "").strip().lower() or None
    summary = (payload.get("summary") or "").strip() or None
    state["discovery"]["completed_at"] = now_iso()
    if segment:
        state["discovery"]["segment"] = segment
    if summary:
        state["discovery"]["summary"] = summary
    # Auto-start deepening clock
    if state["deepening"]["started_at"] is None:
        state["deepening"]["started_at"] = now_iso()
    return state


def op_mark_first_contact(state: dict, payload: dict) -> dict:
    """Catarina marks she sent the FIRST outreach WhatsApp to the lead.

    Idempotent — safe to call multiple times; only the first call sets
    the timestamp. Used by the onboarding-bridge cron job as the
    "Catarina is already on it" signal so the cron doesn't fire her
    again every 15min causing spam.

    Bridge cron condition becomes:
        phase in (discovery_done, deepening_in_progress)
        AND deepening.first_contact_at is null
    """
    # backfill key for tenants whose state.json predates this field
    state["deepening"].setdefault("first_contact_at", None)
    if state["deepening"]["first_contact_at"] is None:
        state["deepening"]["first_contact_at"] = now_iso()
    return state


def op_mark_area_complete(state: dict, payload: dict) -> dict:
    area = (payload.get("area") or "").strip().lower()
    if area not in VALID_AREAS:
        raise SystemExit(
            f"mark_area_complete: area inválida {area!r}. Válidas: {sorted(VALID_AREAS)}"
        )
    covered = state["deepening"]["areas_covered"]
    if area not in covered:
        covered.append(area)
    # Auto-promotion-ready quando todas as áreas fechadas (recompute faz isso)
    if set(covered) >= VALID_AREAS:
        state["deepening"]["completed_at"] = now_iso()
    return state


def op_mark_ready_for_promotion(state: dict, payload: dict) -> dict:
    """Escape hatch — admin override pra promover sem deepening completo."""
    reason = (payload.get("reason") or "").strip()
    # Force-set all areas covered (admin assumes responsibility)
    for area in VALID_AREAS:
        if area not in state["deepening"]["areas_covered"]:
            state["deepening"]["areas_covered"].append(area)
    state["deepening"]["completed_at"] = now_iso()
    state["deepening"]["forced_completion_reason"] = reason or "no reason given"
    return state


def op_mark_promoted(state: dict, payload: dict) -> dict:
    """Chamado pelo backend de promoção quando a migração completa."""
    state["promotion"]["promoted_at"] = now_iso()
    state["promotion"]["promoted_by"] = payload.get("promoted_by") or "system"
    return state


def op_get(state: dict, payload: dict) -> dict:
    return state


OPERATIONS = {
    "init": op_init,
    "set_owner": op_set_owner,
    "mark_discovery_done": op_mark_discovery_done,
    "mark_first_contact": op_mark_first_contact,
    "mark_area_complete": op_mark_area_complete,
    "mark_ready_for_promotion": op_mark_ready_for_promotion,
    "mark_promoted": op_mark_promoted,
    "get": op_get,
}


def main() -> int:
    raw = sys.stdin.read().strip()
    if not raw:
        raise SystemExit("empty stdin — expected JSON action")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SystemExit(f"stdin não é JSON válido: {e}")

    action = payload.get("action")
    if action not in OPERATIONS:
        raise SystemExit(
            f"action inválida: {action!r}. Válidas: {sorted(OPERATIONS)}"
        )

    workspace_root = find_workspace_root(Path(__file__))
    state_path = workspace_root / "state" / "onboarding.json"
    state = load_state(state_path)
    state = OPERATIONS[action](state, payload)
    recompute_phase_and_blockers(state)
    save_state(state_path, state)
    json.dump(state, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
