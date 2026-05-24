#!/usr/bin/env python3
"""Save a Jotaduo client dossier collected during discovery.

Reads a JSON payload from stdin (schema documented in SKILL.md) and writes:
  - memory/jotaduo/clientes/<slug>.json   (machine-readable, full payload)
  - memory/jotaduo/clientes/<slug>.md     (human-readable dossier)

It also appends a one-line entry to memory/MEMORY.md under the
"## Jotaduo - Clientes" section.

Paths are resolved relative to the picoclaw workspace root. The script
walks up from its own location looking for a directory containing both
AGENT.md and a memory/ folder. If not found, it falls back to the current
working directory.

Usage:
    cat client.json | python3 save_client.py
    python3 save_client.py < client.json
    python3 save_client.py --help

Exit codes:
    0 success, 1 invalid input, 2 filesystem error.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


REQUIRED_FIELDS = ("empresa", "segmento")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_only = ascii_only.strip().lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "-", ascii_only)
    ascii_only = re.sub(r"-+", "-", ascii_only).strip("-")
    return ascii_only or "cliente"


def find_workspace_root(start: Path) -> Path:
    for candidate in [start, *start.parents]:
        if (candidate / "AGENT.md").exists() and (candidate / "memory").is_dir():
            return candidate
    return Path.cwd()


def render_markdown(data: dict, now: str) -> str:
    lines: list[str] = []
    lines.append(f"# Dossiê — {data.get('empresa', 'Cliente')}")
    lines.append("")
    lines.append(f"_Coletado em {now}_")
    lines.append("")

    contato = data.get("contato") or {}
    lines.append("## Contato")
    lines.append(f"- Nome: {contato.get('nome') or '—'}")
    lines.append(f"- Cargo: {contato.get('cargo') or '—'}")
    lines.append(f"- E-mail: {contato.get('email') or '—'}")
    lines.append(f"- Telefone: {contato.get('telefone') or '—'}")
    lines.append("")

    lines.append("## Empresa")
    lines.append(f"- Segmento: {data.get('segmento') or '—'}")
    lines.append(f"- Porte: {data.get('porte') or '—'}")
    lines.append(f"- Site: {data.get('site') or '—'}")
    lines.append("")

    def bullet_list(title: str, key: str) -> None:
        items = data.get(key) or []
        lines.append(f"## {title}")
        if not items:
            lines.append("- (não informado)")
        else:
            for item in items:
                lines.append(f"- {item}")
        lines.append("")

    bullet_list("Stack atual", "stack")
    bullet_list("Integrações necessárias", "integracoes_necessarias")
    bullet_list("Fluxos atuais", "fluxos_atuais")

    lines.append("## Dores priorizadas")
    dores = data.get("dores") or []
    if not dores:
        lines.append("- (não informado)")
    else:
        for d in sorted(dores, key=lambda x: x.get("prioridade", 99)):
            prio = d.get("prioridade", "?")
            lines.append(f"- **#{prio}** {d.get('descricao', '')}")
    lines.append("")

    bullet_list("Objetivos / métricas de sucesso", "objetivos")

    lines.append("## Time de agentes recomendado")
    agentes = data.get("agentes_recomendados") or []
    if not agentes:
        lines.append("- (não definido)")
    else:
        for a in agentes:
            lines.append(f"- **{a.get('id', '?')}** — {a.get('justificativa', '')}")
    lines.append("")

    ordem = data.get("ordem_implantacao") or []
    lines.append("## Ordem de implantação")
    if not ordem:
        lines.append("- (não definida)")
    else:
        for i, agent_id in enumerate(ordem, start=1):
            lines.append(f"{i}. {agent_id}")
    lines.append("")

    bullet_list("Próximos passos", "proximos_passos")

    obs = data.get("observacoes")
    if obs:
        lines.append("## Observações")
        lines.append(obs)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def update_memory_index(memory_md: Path, empresa: str, segmento: str,
                        dossier_relpath: str, now: str) -> None:
    header = "## Jotaduo - Clientes"
    entry = f"- {empresa} ({segmento}) - dossiê em {dossier_relpath} - {now}"

    if not memory_md.exists():
        memory_md.write_text(f"# MEMORY\n\n{header}\n\n{entry}\n", encoding="utf-8")
        return

    text = memory_md.read_text(encoding="utf-8")
    if entry in text:
        return
    if header in text:
        lines = text.splitlines()
        out: list[str] = []
        inserted = False
        for i, line in enumerate(lines):
            out.append(line)
            if not inserted and line.strip() == header:
                j = i + 1
                while j < len(lines) and lines[j].strip() == "":
                    out.append(lines[j])
                    j += 1
                out.append(entry)
                inserted = True
                if j < len(lines):
                    out.extend(lines[j:])
                break
        memory_md.write_text("\n".join(out) + "\n", encoding="utf-8")
    else:
        if not text.endswith("\n"):
            text += "\n"
        text += f"\n{header}\n\n{entry}\n"
        memory_md.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Save a Jotaduo client dossier from JSON on stdin.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--workspace",
        type=Path,
        help="Path to the picoclaw workspace root (auto-detected by default).",
    )
    parser.add_argument(
        "--payload-file",
        type=Path,
        help="Read JSON payload from this file instead of stdin. Required when "
             "called from the picoclaw exec tool (action=run), which has no "
             "stdin channel — the data arg is only for action=write sessions.",
    )
    args = parser.parse_args()

    if args.payload_file:
        try:
            payload = json.loads(args.payload_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"ERRO: payload-file inválido ({args.payload_file}): {exc}",
                  file=sys.stderr)
            return 1
    else:
        try:
            payload = json.load(sys.stdin)
        except json.JSONDecodeError as exc:
            print(f"ERRO: JSON inválido na stdin: {exc}", file=sys.stderr)
            return 1

    if not isinstance(payload, dict):
        print("ERRO: payload precisa ser um objeto JSON.", file=sys.stderr)
        return 1

    missing = [f for f in REQUIRED_FIELDS if not payload.get(f)]
    if missing:
        print(f"ERRO: campos obrigatórios ausentes: {', '.join(missing)}",
              file=sys.stderr)
        return 1

    workspace = args.workspace or find_workspace_root(Path(__file__).resolve().parent)
    clientes_dir = workspace / "memory" / "jotaduo" / "clientes"
    try:
        clientes_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        print(f"ERRO: não foi possível criar {clientes_dir}: {exc}",
              file=sys.stderr)
        return 2

    slug = slugify(payload["empresa"])
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    payload.setdefault("_meta", {})["salvo_em"] = now

    json_path = clientes_dir / f"{slug}.json"
    md_path = clientes_dir / f"{slug}.md"

    try:
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                             encoding="utf-8")
        md_path.write_text(render_markdown(payload, now), encoding="utf-8")
    except OSError as exc:
        print(f"ERRO: falha ao gravar dossiê: {exc}", file=sys.stderr)
        return 2

    memory_md = workspace / "memory" / "MEMORY.md"
    try:
        relpath = md_path.relative_to(workspace).as_posix()
    except ValueError:
        relpath = str(md_path)
    try:
        update_memory_index(memory_md, payload["empresa"],
                            payload.get("segmento", "outro"), relpath, now)
    except OSError as exc:
        print(f"AVISO: dossiê salvo, mas falha ao atualizar MEMORY.md: {exc}",
              file=sys.stderr)

    print(f"OK Dossiê salvo:\n  {md_path}\n  {json_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
