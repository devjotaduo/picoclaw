#!/usr/bin/env python3
"""Deterministic Catarina inbox poller.

Reads new owner replies from jotaduo-wa inbox, advances one deepening area,
and sends the next short question through the institutional Jotaduo WhatsApp.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

AREA_ORDER = ["equipe", "casos-excecao", "faq", "historico", "regras-tacitas"]
AREA_LABELS = {
    "equipe": "equipe",
    "casos-excecao": "casos de excecao",
    "faq": "duvidas frequentes",
    "historico": "historico de problemas",
    "regras-tacitas": "regras tacitas",
}
QUESTIONS = {
    "casos-excecao": (
        "Agora quero entender casos de excecao: qual situacao costuma fugir "
        "do padrao e exigir decisao sua antes de responder?"
    ),
    "faq": (
        "Quais duvidas reais os clientes repetem mais no WhatsApp ou Instagram, "
        "mesmo quando parecem simples?"
    ),
    "historico": (
        "Me conta um caso recente que deu errado no atendimento e como voces "
        "resolveram, para eu registrar a regra certa."
    ),
    "regras-tacitas": (
        "Quais regras nao escritas a equipe ja sabe, mas que uma IA nova "
        "poderia errar se ninguem explicasse?"
    ),
}
VALID_PHASES = {"discovery_done", "deepening_in_progress", "ready_for_promotion"}


def fail(message: str, code: int = 1) -> int:
    print(f"INBOX_ERROR: {message}")
    return code


def run(cmd: list[str], *, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, input=stdin, text=True, capture_output=True, check=False)


def run_json(cmd: list[str], *, stdin_obj: dict | None = None) -> dict:
    stdin = json.dumps(stdin_obj) if stdin_obj is not None else None
    result = run(cmd, stdin=stdin)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "").strip())
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from {' '.join(cmd)}: {exc}") from exc


def parse_messages(stdout: str) -> list[dict]:
    messages: list[dict] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            messages.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"invalid inbox JSONL line: {exc}")
    return messages


def first_missing_area(covered: set[str]) -> str | None:
    for area in AREA_ORDER:
        if area not in covered:
            return area
    return None


def next_area_after(area: str, covered: set[str]) -> str | None:
    try:
        start = AREA_ORDER.index(area) + 1
    except ValueError:
        start = 0
    for candidate in AREA_ORDER[start:]:
        if candidate not in covered:
            return candidate
    return None


def main() -> int:
    home = Path(os.environ.get("PICOCLAW_HOME", "/root/.picoclaw"))
    workspace = home / "workspace"
    state_py = workspace / "skills/onboarding-state/scripts/state.py"
    check_py = workspace / "skills/verificar-respostas-jotaduo/scripts/check-inbox.py"
    send_py = workspace / "skills/enviar-whatsapp-jotaduo/scripts/send.py"

    for path in (state_py, check_py, send_py):
        if not path.is_file():
            return fail(f"required skill script missing: {path}")

    try:
        state = run_json(["python3", str(state_py)], stdin_obj={"action": "get"})
    except RuntimeError as exc:
        return fail(f"onboarding-state get failed: {exc}")

    phase = str(state.get("phase") or "")
    if phase not in VALID_PHASES:
        print(f"SILENT_NOOP phase={phase}")
        return 0

    peek = run(["python3", str(check_py), "--limit", "5"])
    if peek.returncode != 0:
        return fail(f"check-inbox failed: {(peek.stderr or peek.stdout).strip()}")
    if not peek.stdout.strip():
        print("SILENT_NOOP no_owner_response")
        return 0

    try:
        messages = parse_messages(peek.stdout)
    except RuntimeError as exc:
        return fail(str(exc))
    if not messages:
        print("SILENT_NOOP no_owner_response")
        return 0

    deepening = state.get("deepening") or {}
    covered = set(deepening.get("areas_covered") or [])
    completed_area = first_missing_area(covered)
    if completed_area is None:
        consume = run(["python3", str(check_py), "--consume", "--limit", str(len(messages))])
        if consume.returncode != 0:
            return fail(f"consume failed: {(consume.stderr or consume.stdout).strip()}")
        print(f"SILENT_NOOP all_areas_complete messages={len(messages)}")
        return 0

    next_area = next_area_after(completed_area, covered | {completed_area})

    try:
        run_json(["python3", str(state_py)], stdin_obj={"action": "mark_owner_response"})
    except RuntimeError as exc:
        return fail(f"mark_owner_response failed: {exc}")

    owner = state.get("owner_captured") or {}
    phone = str(owner.get("whatsapp") or "").strip()
    name = str(owner.get("name") or "la").strip() or "la"

    if next_area:
        if not phone:
            return fail("owner phone missing in state.owner_captured.whatsapp")
        message = (
            f"Li sua resposta sobre {AREA_LABELS.get(completed_area, completed_area)}. "
            f"{QUESTIONS[next_area]}"
        )
        send = run(["python3", str(send_py), phone, message])
        if send.returncode != 0:
            return fail(
                "send.py rc=%s out=%s"
                % (send.returncode, (send.stderr or send.stdout).strip())
            )

    try:
        run_json(
            ["python3", str(state_py)],
            stdin_obj={"action": "mark_area_complete", "area": completed_area},
        )
        if next_area:
            run_json(["python3", str(state_py)], stdin_obj={"action": "mark_outreach_sent"})
    except RuntimeError as exc:
        return fail(f"state update failed after send: {exc}")

    consume = run(["python3", str(check_py), "--consume", "--limit", str(len(messages))])
    if consume.returncode != 0:
        return fail(f"consume failed: {(consume.stderr or consume.stdout).strip()}")

    if not next_area:
        print(f"INBOX_DONE completed={completed_area} messages={len(messages)}")
        return 0

    print(
        "INBOX_DISPATCHED "
        f"completed={completed_area} next={next_area} "
        f"phone={phone.lstrip('+')} name={name} messages={len(messages)}"
    )
    print(f"send_result={(send.stdout or '').strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
