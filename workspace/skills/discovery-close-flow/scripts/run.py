#!/usr/bin/env python3
"""Deterministic discovery-close poller (Sofia side).

Symmetric to catarina-inbox-flow (the deepening-side poller): a cron-driven
script that crystallizes onboarding state WITHOUT depending on the LLM
emitting a tool call. This is the durable fix for the claude-cli regime,
which can converse reliably (plain text) but does NOT reliably emit
tool_calls — see [[project_catarina_tool_call_blocker]].

How it works:
  - At the end of discovery, Sofia (which runs as the `main` agent on the
    root workspace in a public tenant) drops ONE file:
        state/discovery-close.request.json
    a valid onboarding-state `discovery_close` payload
    ({action, empresa, segment, summary, owner:{name,email,whatsapp}, facts}).
    Dropping a single
    file is the most reliable action the model can take; everything else is
    deterministic.
  - This poller (cron `onboarding-discovery-close`, every few minutes) reads
    that file and runs `state.py --payload-file <file>`, which atomically
    sets the owner + marks discovery_done. Then it archives the request so
    it never re-runs.
  - On the Messages API regime the agent also runs the same command inline
    for instant crystallization; this poller then just finds the state
    already closed and archives the request as a no-op. Idempotent either way.

Outputs (single line, for the cron log):
  SILENT_NOOP <reason>          — nothing to do this tick
  DISCOVERY_ALREADY_DONE        — state already closed (inline path won the race)
  DISCOVERY_CLOSED email=...    — crystallized successfully this tick
  CLOSE_ERROR: <reason>         — request was malformed; archived to .error
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


def fail(message: str, code: int = 1) -> int:
    print(f"CLOSE_ERROR: {message}")
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


def archive(request: Path, suffix: str) -> None:
    """Move the request out of the way so the poller doesn't re-run it.
    suffix is 'done' or 'error'. Best-effort — a failed rename is logged but
    not fatal (next tick the idempotent state.py path handles it)."""
    target = request.with_name(f"{request.stem}.{suffix}{request.suffix}")
    try:
        request.replace(target)
    except OSError as exc:
        print(f"WARN: could not archive request to {target.name}: {exc}")


def segment_block(segment: str) -> str:
    seg = (segment or "").strip().lower()
    blocks = {
        "saude": "Canal de agendamento: a validar com dono\nEspecialidades: a validar com dono\nConvênios aceitos: a validar com dono\n",
        "alimentacao": "Cardápio: a validar com dono\nDelivery próprio: a validar com dono\nPlataformas de delivery: a validar com dono\n",
        "varejo": "Catálogo: a validar com dono\nPolítica de troca: a validar com dono\nFaz entrega: a validar com dono\n",
        "servicos": "Como gera orçamento: a validar com dono\nPrazo padrão: a validar com dono\n",
        "beleza": "Canal de agendamento: a validar com dono\nLista de serviços: a validar com dono\n",
        "educacao": "Cursos oferecidos: a validar com dono\nComo faz matrícula: a validar com dono\n",
        "imobiliaria": "Tipos de imóvel: a validar com dono\nComo agenda visita: a validar com dono\n",
    }
    return blocks.get(seg, "")


def company_from_payload(payload: dict) -> str:
    empresa = (
        payload.get("empresa")
        or payload.get("company")
        or payload.get("company_name")
        or payload.get("nome_empresa")
        or payload.get("business_name")
        or ""
    )
    empresa = str(empresa or "").strip()
    if empresa:
        return empresa
    summary = str(payload.get("summary") or payload.get("resumo") or "").strip()
    first = summary.splitlines()[0].strip() if summary else ""
    for separator in (":", " - ", " – ", " — ", ", "):
        if separator in first:
            candidate = first.split(separator, 1)[0].strip()
            if len(candidate) >= 3:
                return candidate
    return "a validar"


def owner_from_payload(payload: dict) -> dict:
    owner = payload.get("owner") if isinstance(payload.get("owner"), dict) else {}
    return {
        "name": (
            owner.get("name")
            or owner.get("nome")
            or payload.get("name")
            or payload.get("nome")
            or ""
        ),
        "email": owner.get("email") or payload.get("email") or "",
        "whatsapp": (
            owner.get("whatsapp")
            or owner.get("telefone")
            or payload.get("whatsapp")
            or payload.get("telefone")
            or ""
        ),
    }


def validate_request(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return "request must be a JSON object"
    if payload.get("action") != "discovery_close":
        return "request action must be discovery_close"
    owner = owner_from_payload(payload)
    missing: list[str] = []
    for key in ("segment", "summary"):
        if not str(payload.get(key) or "").strip():
            missing.append(key)
    if not str(owner["name"] or "").strip():
        missing.append("owner.name")
    if not str(owner["email"] or "").strip():
        missing.append("owner.email")
    if not str(owner["whatsapp"] or "").strip():
        missing.append("owner.whatsapp")
    if missing:
        return "request missing required field(s): " + ", ".join(missing)
    return None


def bootstrap_empresa_md(workspace: Path, payload: dict) -> None:
    """Create a minimally valid memory/empresa.md when absent/empty.

    We only bootstrap on first discovery close to avoid tenant-liberation
    deadlocks where onboarding state is closed but empresa.md stays blank.
    Existing non-empty files are preserved.
    """
    empresa = workspace / "memory" / "empresa.md"
    try:
        if empresa.is_file() and empresa.read_text(encoding="utf-8").strip():
            return
    except OSError:
        return

    owner = owner_from_payload(payload)
    name = company_from_payload(payload)
    email = (owner.get("email") or "a validar").strip()
    whatsapp = (owner.get("whatsapp") or "a validar").strip()
    segment = (payload.get("segment") or "default").strip().lower() or "default"
    summary = (payload.get("summary") or "a validar com dono").strip()
    extra = segment_block(segment)
    text = (
        "# Memória da empresa\n\n"
        f"Nome: {name}\n"
        f"Segmento: {segment}\n"
        f"Descrição: {summary}\n"
        "Produtos ou serviços: a validar com dono\n"
        "Horário: a validar com dono\n"
        "Endereço: a validar com dono\n"
        "Regiões atendidas: a validar com dono\n"
        f"WhatsApp: {whatsapp}\n"
        f"Email: {email}\n"
        "Instagram: a validar com dono\n"
        "Site: a validar com dono\n"
        "Formas de pagamento: a validar com dono\n"
        "Pode falar preço: a validar com dono\n"
        "Faixa de preço: a validar com dono\n"
        "Quando chamar humano: a validar com dono\n"
        "Informações que nunca podem ser inventadas: a validar com dono\n"
        "Informações proibidas de falar: a validar com dono\n"
        f"Segmento detectado: {segment}\n"
        f"{extra}"
        "Status da informação: validado pelo dono em bootstrap-discovery-close\n"
        "\n## Cadastro da empresa — concluído\n"
    )
    empresa.parent.mkdir(parents=True, exist_ok=True)
    empresa.write_text(text, encoding="utf-8")


def main() -> int:
    home = Path(os.environ.get("PICOCLAW_HOME", "/root/.picoclaw"))
    workspace = home / "workspace"
    state_py = workspace / "skills/onboarding-state/scripts/state.py"
    request = workspace / "state/discovery-close.request.json"

    if not state_py.is_file():
        return fail(f"required skill script missing: {state_py}")

    if not request.is_file():
        print("SILENT_NOOP no_request")
        return 0

    # Validate the request is parseable JSON before doing anything with state.
    try:
        payload = json.loads(request.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        archive(request, "error")
        return fail(f"unreadable/invalid request json: {exc}")
    validation_error = validate_request(payload)
    if validation_error:
        archive(request, "error")
        return fail(validation_error)

    # If the inline path (Messages API) already crystallized, just archive.
    try:
        state = run_json(["python3", str(state_py)], stdin_obj={"action": "get"})
    except RuntimeError as exc:
        return fail(f"onboarding-state get failed: {exc}")
    owner = state.get("owner_captured") or {}
    discovery = state.get("discovery") or {}
    if (owner.get("email") or "").strip() and discovery.get("completed_at"):
        archive(request, "done")
        print("DISCOVERY_ALREADY_DONE")
        return 0

    # Crystallize: state.py reads the request file directly (action=discovery_close).
    result = run(["python3", str(state_py), "--payload-file", str(request)])
    if result.returncode != 0:
        reason = (result.stderr or result.stdout or "").strip()
        # Malformed payload (e.g. invalid email) — archive so we don't loop
        # forever; the visitor can re-trigger by finishing discovery again.
        archive(request, "error")
        return fail(reason or "state.py discovery_close failed")

    archive(request, "done")
    bootstrap_empresa_md(workspace, payload)
    email = (owner_from_payload(payload).get("email") or "").strip().lower()
    print(f"DISCOVERY_CLOSED email={email}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
