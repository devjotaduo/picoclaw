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

import contextlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

try:
    import fcntl  # POSIX only — Linux/macOS. Windows dev path skips locking.
    _HAS_FCNTL = True
except ImportError:
    _HAS_FCNTL = False


VALID_AREAS = {"equipe", "casos-excecao", "faq", "historico", "regras-tacitas"}
AREA_ALIASES = {
    "profissionais": "equipe",
    "excecoes": "casos-excecao",
    "casos_excecao": "casos-excecao",
    "casos excecao": "casos-excecao",
}
# Audit P1 #17: when Catarina has been waiting on the lead for longer than
# this threshold without any response, surface a `lead_timeout_days: N` line
# in `promotion.blocked_by` so the admin sees stale tenants in the panel.
# Informational only — does NOT block promote (admin can still force-promote).
LEAD_TIMEOUT_DAYS = 7
VALID_PHASES = {
    "discovery_in_progress",
    "discovery_done",
    "deepening_in_progress",
    "ready_for_promotion",
    "promoted",
}
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# Roster ids reais (ver jotaduo-discovery/references/agent-catalog.md).
# A Sofia pode enviar nomes de exibicao; aqui normalizamos para ids de roster
# e descartamos pendencias de criacao que ainda nao existem como agente.
ROSTER_ALIASES = {
    "rafael": "main",
    "main": "main",
    "clara": "clara",
    "luna": "luna",
    "marcos": "marcos",
    "camila": "camila",
    "lia": "lia",
    "sofia": "sofia",
    "catarina": "catarina",
}


def recommended_names(value) -> list[str]:
    """Flatten agentes_recomendados from strings or {id,nome} objects."""
    if value is None:
        return []
    if not isinstance(value, list):
        value = [value]
    names: list[str] = []
    for item in value:
        if isinstance(item, dict):
            names.append(str(item.get("id") or item.get("nome") or item.get("name") or ""))
        else:
            names.append(str(item))
    return names


def normalize_recommended(value) -> list[str]:
    """Normalize to real roster ids, deduped, preserving recommendation order."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in recommended_names(value):
        roster_id = ROSTER_ALIASES.get(raw.strip().lower())
        if roster_id and roster_id not in seen:
            seen.add(roster_id)
            out.append(roster_id)
    return out

# Brazilian-friendly: +55 11 99999-8888 / 11999998888 / etc. Strip non-digits then check length.
WHATSAPP_DIGITS_MIN = 10  # 10 sem DDI; agente normaliza pra +55 depois

# Audit P1 #14: cap free-text fields the user (or LLM-translated user
# input) controls before they hit disk. Length cap defeats a stupid
# 5000-char company name from inflating onboarding.json; control-char
# strip + tag strip keeps newlines + HTML out of single-line fields.
# This is defense in depth — the frontend should also sanitize, and
# downstream readers MUST NOT trust state.json as already-safe HTML.
NAME_MAX_LEN = 200
SEGMENT_MAX_LEN = 80
SUMMARY_MAX_LEN = 2000
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
_TAG_LIKE_RE = re.compile(r"<[^>]+>")
MEMORY_SEGMENT_ALIASES = {
    "clinica": "saude",
    "clínica": "saude",
    "clinico": "saude",
    "clínico": "saude",
    "saude": "saude",
    "saúde": "saude",
    "restaurante": "alimentacao",
    "alimentacao": "alimentacao",
    "alimentação": "alimentacao",
    "ecommerce": "varejo",
    "e-commerce": "varejo",
    "loja": "varejo",
    "varejo": "varejo",
    "vendas": "servicos",
    "servicos": "servicos",
    "serviços": "servicos",
    "beleza": "beleza",
    "estetica": "beleza",
    "estética": "beleza",
    "educacao": "educacao",
    "educação": "educacao",
    "imobiliaria": "imobiliaria",
    "imobiliária": "imobiliaria",
}


_SCRIPT_CONTENT_RE = re.compile(
    r"<(script|style|iframe|object|embed)[^>]*>.*?</(script|style|iframe|object|embed)>",
    re.IGNORECASE | re.DOTALL,
)


def sanitize_short_text(value: str, max_len: int = NAME_MAX_LEN) -> str:
    """Strip control chars + HTML-ish tags from a single-line field and
    truncate. Returns empty when input is empty/whitespace. Use for owner
    name, segment, etc. — fields where newlines should not survive.

    NOTE: script/style content is stripped entirely (including inner text)
    before generic tag removal, so <script>alert(1)</script> → "" not "alert(1)".
    """
    if not value:
        return ""
    cleaned = _CONTROL_CHAR_RE.sub("", value)
    cleaned = _SCRIPT_CONTENT_RE.sub("", cleaned)
    cleaned = _TAG_LIKE_RE.sub("", cleaned).strip()
    return cleaned[:max_len]


def sanitize_long_text(value: str, max_len: int = SUMMARY_MAX_LEN) -> str:
    """Like sanitize_short_text but preserves newlines (Sofia's discovery
    summary may be multi-line). Still strips other control chars + tags."""
    if not value:
        return ""
    # Keep \n + \t; strip everything else in 0x00-0x1f.
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    cleaned = _SCRIPT_CONTENT_RE.sub("", cleaned)
    cleaned = _TAG_LIKE_RE.sub("", cleaned).strip()
    return cleaned[:max_len]


# Audit P1 #13: bump SCHEMA_VERSION whenever required fields are added so
# old state.json files get migrated lazily on load (`migrate_state`)
# instead of silently breaking parsers. Don't change semantics of an
# existing version — bump and migrate.
SCHEMA_VERSION = 5


def migrate_state(state: dict) -> dict:
    """Lazy upgrade of older state shapes to SCHEMA_VERSION. Idempotent.

    v1 -> v2: adds deepening.first_contact_at, .last_outreach_at,
             .last_owner_response_at. Pre-v1 state (no schema_version
             key) is treated as v1.
    v2 -> v3: adds bridge attempt/failure observability so the Sofia ->
             Catarina bridge can retry safely after WhatsApp send errors.
    v3 -> v4: adds discovery.agentes_recomendados, the robust source used by
             promotion to expose only the recommended tenant-facing agents.
    v4 -> v5: adds testing.*, the private pre-provisioned tenant mode that
             gates owner/admin go-live without changing DB tenant status.
    """
    version = state.get("schema_version", 1)
    if version < 2:
        deep = state.setdefault("deepening", {})
        deep.setdefault("first_contact_at", None)
        deep.setdefault("last_outreach_at", None)
        deep.setdefault("last_owner_response_at", None)
    if version < 3:
        deep = state.setdefault("deepening", {})
        deep.setdefault("last_bridge_attempt_at", None)
        deep.setdefault("last_bridge_failed_at", None)
        deep.setdefault("last_bridge_error", None)
    if version < 4:
        discovery = state.setdefault("discovery", {})
        discovery.setdefault("agentes_recomendados", [])
    if version < 5:
        testing = state.setdefault("testing", {})
        testing.setdefault("status", "not_configured")
        testing.setdefault("started_at", None)
        testing.setdefault("completed_at", None)
        testing.setdefault("completed_by", None)
        testing.setdefault("completed_source", None)
        testing.setdefault("allowlist_required", False)
    audit = state.setdefault("audit", {})
    audit.setdefault("events", [])
    state["schema_version"] = SCHEMA_VERSION
    return state


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def find_workspace_root(start: Path) -> Path:
    """Sobe diretórios procurando um que tenha AGENT.md. Fallback: $PICOCLAW_HOME/workspace.

    Define PICOCLAW_WORKSPACE_OVERRIDE env var to point directly to a workspace
    directory for isolated testing without touching the real workspace."""
    import os

    # Allow full override for testing/CI isolation.
    override = os.environ.get("PICOCLAW_WORKSPACE_OVERRIDE")
    if override:
        candidate = Path(override).resolve()
        if candidate.is_dir():
            return candidate
        raise SystemExit(f"PICOCLAW_WORKSPACE_OVERRIDE path not found: {override}")

    cur = start.resolve()
    for parent in [cur, *cur.parents]:
        if (parent / "AGENT.md").is_file() and parent.name.lower() == "workspace":
            return parent
    # Fallback: olhar PICOCLAW_HOME env
    home = os.environ.get("PICOCLAW_HOME")
    if home:
        candidate = Path(home) / "workspace"
        if candidate.is_dir():
            return candidate
    raise SystemExit("could not find workspace root (no AGENT.md found walking up + PICOCLAW_HOME unset)")


def empty_state() -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "phase": "discovery_in_progress",
        "discovery": {
            "started_at": now_iso(),
            "completed_at": None,
            "segment": None,
            "summary": None,
            "agentes_recomendados": [],
            "agent": "sofia",
        },
        "deepening": {
            "started_at": None,
            "first_contact_at": None,
            "last_outreach_at": None,        # P1 #17: Catarina chama mark_outreach_sent
            "last_owner_response_at": None,  # P1 #17: Catarina chama mark_owner_response
            "last_bridge_attempt_at": None,
            "last_bridge_failed_at": None,
            "last_bridge_error": None,
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
        "testing": {
            "status": "not_configured",
            "started_at": None,
            "completed_at": None,
            "completed_by": None,
            "completed_source": None,
            "allowlist_required": False,
        },
        "audit": {
            "events": [],
        },
    }


def load_state(path: Path) -> dict:
    if not path.is_file():
        return empty_state()
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"onboarding.json corrupted: {e}")
    # Lazy migration (P1 #13): old tenants without newer fields auto-upgrade
    # on first read after a state.py upgrade. main() saves the migrated
    # version so subsequent loads are fast-paths.
    return migrate_state(loaded)


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


@contextlib.contextmanager
def locked_state_file(state_path: Path):
    """Serializa invocações concorrentes de state.py via fcntl.flock num
    sibling lockfile. Audit P1 #10 (2026-05-27): sem isso, o
    read-modify-write em main() perde updates quando Sofia + Catarina +
    admin invocam a skill ao mesmo tempo (cenário real em tenant publico
    com visitante + Catarina + ops).

    Lockfile separado de onboarding.json (sibling .lock) pra evitar
    truncar/recriar o state file só pra adquirir o lock. fcntl.LOCK_EX
    bloqueia até liberar; sem timeout porque cada operação é rápida
    (read+mutate+write é <10ms) — se travar é bug.

    Windows dev: fcntl não existe, then yield direto (no-op). Em prod
    tenants são sempre Linux então race fica coberta.
    """
    if not _HAS_FCNTL:
        yield
        return
    state_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = state_path.with_name(state_path.name + ".lock")
    with open(lock_path, "w", encoding="utf-8") as lockfile:
        fcntl.flock(lockfile.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lockfile.fileno(), fcntl.LOCK_UN)


def empresa_memory_filled(workspace_root: Path) -> tuple[bool, str]:
    """Ground-truth check for audit P0 #6: memory/empresa.md must contain
    real curadoria content before promotion, not just the template
    skeleton. Catarina (or Sofia, in discovery) can mark all the state-
    machine flags green without ever writing to the file — if that
    happens, the new tenant's roster agents inherit an empty empresa.md
    and have nothing to ground their answers on.

    Threshold: at least 3 colon-labels (Nome:, Segmento:, Descrição: …)
    have a non-empty value AND the value is not "pendente de validação"
    (the template default). Returns (is_filled, reason_if_not).
    """
    empresa_path = workspace_root / "memory" / "empresa.md"
    if not empresa_path.is_file():
        return False, "memory/empresa.md does not exist"
    try:
        text = empresa_path.read_text(encoding="utf-8")
    except OSError as e:
        return False, f"memory/empresa.md unreadable: {e}"

    filled = 0
    for line in text.splitlines():
        m = re.match(r"^[A-Za-zÀ-ÿ][^:#]*:\s*(.+?)\s*$", line)
        if not m:
            continue
        value = m.group(1).strip()
        if not value or value.lower().startswith("pendente"):
            continue
        filled += 1

    if filled < 3:
        return False, f"memory/empresa.md has only {filled} filled field(s) (min 3)"
    return True, ""


def canonical_memory_segment(segment: str | None) -> str:
    raw = sanitize_short_text(segment or "", SEGMENT_MAX_LEN).lower()
    return MEMORY_SEGMENT_ALIASES.get(raw, raw or "servicos")


def infer_company_name(state: dict, payload: dict) -> str:
    for key in ("empresa", "company", "company_name", "nome_empresa", "business_name"):
        value = sanitize_short_text(payload.get(key) or "", NAME_MAX_LEN)
        if value:
            return value

    summary = sanitize_long_text(
        (state.get("discovery") or {}).get("summary") or "",
        SUMMARY_MAX_LEN,
    )
    first_line = summary.splitlines()[0] if summary else ""
    before_colon = first_line.split(":", 1)[0].strip() if ":" in first_line else ""
    if before_colon and 1 <= len(before_colon.split()) <= 8:
        return sanitize_short_text(before_colon, NAME_MAX_LEN)

    return ""


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_only = ascii_only.strip().lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "-", ascii_only)
    ascii_only = re.sub(r"-+", "-", ascii_only).strip("-")
    return ascii_only or "cliente"


def infer_empresa_from_summary(summary: str) -> str:
    """Best-effort company name extraction for legacy discovery_close payloads.

    Older tool schemas may reject extra fields such as `empresa`, `owner` and
    `facts`. In that compatibility mode the Sofia prompt makes `summary`
    start with the exact company name, e.g. "Clínica Aurora: ...".
    """
    first = sanitize_long_text(summary or "", SUMMARY_MAX_LEN).splitlines()[0].strip()
    first = re.sub(
        r"^(empresa|negócio|negocio)\s*[:\-]\s*",
        "",
        first,
        flags=re.IGNORECASE,
    )
    match = re.match(r"^(.{3,120}?)(?:\s+[-–—]\s+|:\s+|,\s+)", first)
    if match:
        return sanitize_short_text(match.group(1), NAME_MAX_LEN)
    return ""


def normalize_owner_payload(payload: dict) -> dict:
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
        "captured_by": payload.get("captured_by") or owner.get("captured_by") or "sofia",
    }


def normalize_discovery_close_payload(payload: dict) -> dict:
    """Normaliza o contrato final do discovery para uma forma interna.

    O payload novo usa `owner.{name,email,whatsapp}`; mantemos leitura dos
    campos planos por compatibilidade com tenants que já geraram request antes
    da mudança de prompt.
    """
    owner_payload = normalize_owner_payload(payload)
    summary = sanitize_long_text(
        payload.get("summary") or payload.get("resumo") or "",
        SUMMARY_MAX_LEN,
    )
    empresa = sanitize_short_text(
        payload.get("empresa")
        or payload.get("company")
        or payload.get("company_name")
        or payload.get("nome_empresa")
        or payload.get("business_name")
        or "",
        NAME_MAX_LEN,
    )
    if not empresa:
        empresa = infer_empresa_from_summary(summary)
    segment = sanitize_short_text(
        payload.get("segment") or payload.get("segmento") or "",
        SEGMENT_MAX_LEN,
    ).lower()

    missing: list[str] = []
    if not empresa:
        missing.append("empresa (ou summary começando com '<empresa>: ...')")
    if not segment:
        missing.append("segment")
    if not summary:
        missing.append("summary")
    if not sanitize_short_text(owner_payload.get("name") or "", NAME_MAX_LEN):
        missing.append("owner.name")
    if not (owner_payload.get("email") or "").strip():
        missing.append("owner.email")
    if not (owner_payload.get("whatsapp") or "").strip():
        missing.append("owner.whatsapp")
    if missing:
        raise SystemExit(
            "discovery_close: campos obrigatórios ausentes: "
            + ", ".join(missing)
        )

    facts = payload.get("facts") if isinstance(payload.get("facts"), dict) else {}
    return {
        "empresa": empresa,
        "segment": segment,
        "summary": summary,
        "owner": owner_payload,
        "facts": facts,
        "captured_by": sanitize_short_text(
            payload.get("captured_by") or owner_payload.get("captured_by") or "sofia",
            50,
        ) or "sofia",
    }


def fact_list(facts: dict, key: str) -> list[str]:
    raw = facts.get(key)
    if raw is None:
        return []
    values = raw if isinstance(raw, list) else [raw]
    out: list[str] = []
    for value in values:
        if isinstance(value, dict):
            text = (
                value.get("nome")
                or value.get("name")
                or value.get("id")
                or value.get("descricao")
                or value.get("description")
                or ""
            )
        else:
            text = str(value)
        cleaned = sanitize_short_text(text, 300)
        if cleaned:
            out.append(cleaned)
    return out


def markdown_bullets(items: list[str], fallback: str = "a detalhar com Catarina") -> list[str]:
    if not items:
        return [f"- {fallback}"]
    return [f"- {item}" for item in items]


def render_discovery_close_empresa_memory(state: dict, payload: dict) -> str:
    normalized = normalize_discovery_close_payload(payload)
    owner_payload = normalized["owner"]
    owner_name = sanitize_short_text(owner_payload.get("name") or "", NAME_MAX_LEN)
    email = (owner_payload.get("email") or "").strip().lower()
    whatsapp = sanitize_short_text(owner_payload.get("whatsapp") or "", 30)
    facts = normalized["facts"]
    completed_at = (state.get("discovery") or {}).get("completed_at") or now_iso()
    canonical_segment = canonical_memory_segment(normalized["segment"])

    lines = [
        "# Empresa",
        "",
        f"Status: validado pelo dono em {completed_at}",
        f"Nome: {normalized['empresa']}",
        f"Segmento: {normalized['segment']}",
        f"Contato email: {email}",
        f"Contato WhatsApp: {whatsapp}",
        "",
        "## Resumo",
        normalized["summary"],
        "",
        "## Canais",
        *markdown_bullets(fact_list(facts, "canais")),
        "",
        "## Sistemas atuais",
        *markdown_bullets(fact_list(facts, "sistemas")),
        "",
        "## Dores priorizadas",
        *markdown_bullets(fact_list(facts, "dores")),
        "",
        "## Objetivos 90 dias",
        *markdown_bullets(fact_list(facts, "objetivos_90d")),
        "",
        "## Responsável",
        f"Nome: {owner_name}",
        f"Capturado por: {normalized['captured_by']}",
        "",
        "## Agentes recomendados",
        *markdown_bullets(fact_list(facts, "agentes_recomendados")),
        "",
        "## Campos operacionais",
        f"Segmento detectado: {canonical_segment}",
        "Produtos ou serviços: a detalhar com Catarina",
        "Horário: a detalhar com Catarina",
        "Endereço: a detalhar com Catarina",
        "Regiões atendidas: a detalhar com Catarina",
        "Quando chamar humano: a detalhar com Catarina",
        "Informações que nunca podem ser inventadas: dados não confirmados pelo dono",
        "",
        "## Pendências sinalizadas pro dono resolver",
        "- Catarina deve aprofundar equipe, casos de exceção, FAQ, histórico e regras tácitas antes da promoção final.",
    ]
    return "\n".join(lines).rstrip() + "\n"


def build_discovery_dossier_payload(state: dict, payload: dict) -> dict:
    normalized = normalize_discovery_close_payload(payload)
    owner_payload = normalized["owner"]
    facts = normalized["facts"]
    return {
        "empresa": normalized["empresa"],
        "segmento": normalized["segment"],
        "contato": {
            "nome": sanitize_short_text(owner_payload.get("name") or "", NAME_MAX_LEN),
            "email": (owner_payload.get("email") or "").strip().lower(),
            "telefone": sanitize_short_text(owner_payload.get("whatsapp") or "", 30),
        },
        "stack": fact_list(facts, "sistemas"),
        "canais": fact_list(facts, "canais"),
        "dores": [
            {"prioridade": i, "descricao": item}
            for i, item in enumerate(fact_list(facts, "dores"), start=1)
        ],
        "objetivos": fact_list(facts, "objetivos_90d"),
        "agentes_recomendados": [
            {"id": item, "justificativa": "recomendado no discovery inicial"}
            for item in fact_list(facts, "agentes_recomendados")
        ],
        "ordem_implantacao": fact_list(facts, "agentes_recomendados"),
        "observacoes": normalized["summary"],
        "_meta": {
            "captured_by": normalized["captured_by"],
            "source": "onboarding-state.discovery_close",
            "discovery_completed_at": (state.get("discovery") or {}).get("completed_at"),
        },
    }


def render_discovery_dossier_markdown(dossier: dict, collected_at: str) -> str:
    contato = dossier.get("contato") or {}
    lines = [
        f"# Dossiê — {dossier.get('empresa') or 'Cliente'}",
        "",
        f"_Coletado em {collected_at}_",
        "",
        "## Contato",
        f"- Nome: {contato.get('nome') or '—'}",
        f"- E-mail: {contato.get('email') or '—'}",
        f"- Telefone: {contato.get('telefone') or '—'}",
        "",
        "## Empresa",
        f"- Segmento: {dossier.get('segmento') or '—'}",
        "",
        "## Resumo",
        dossier.get("observacoes") or "—",
        "",
        "## Canais",
        *markdown_bullets(dossier.get("canais") or [], "(não informado)"),
        "",
        "## Stack atual",
        *markdown_bullets(dossier.get("stack") or [], "(não informado)"),
        "",
        "## Dores priorizadas",
    ]
    dores = dossier.get("dores") or []
    if dores:
        for dor in dores:
            lines.append(f"- #{dor.get('prioridade', '?')} {dor.get('descricao', '')}")
    else:
        lines.append("- (não informado)")
    lines.extend([
        "",
        "## Objetivos / métricas de sucesso",
        *markdown_bullets(dossier.get("objetivos") or [], "(não informado)"),
        "",
        "## Time de agentes recomendado",
    ])
    agentes = dossier.get("agentes_recomendados") or []
    if agentes:
        for agente in agentes:
            lines.append(f"- {agente.get('id') or '?'} — {agente.get('justificativa') or ''}")
    else:
        lines.append("- (não definido)")
    return "\n".join(lines).rstrip() + "\n"


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def write_discovery_close_outputs(state: dict, payload: dict, workspace_root: Path) -> None:
    """Escritas determinísticas que fecham o discovery como unidade lógica.

    Falhar aqui interrompe a operação antes de salvar onboarding.json, então a
    Sofia só recebe sucesso quando empresa.md e o dossiê também foram gravados.
    """
    normalized = normalize_discovery_close_payload(payload)
    empresa_path = workspace_root / "memory" / "empresa.md"
    atomic_write_text(empresa_path, render_discovery_close_empresa_memory(state, payload))

    dossier = build_discovery_dossier_payload(state, payload)
    clientes_dir = workspace_root / "memory" / "jotaduo" / "clientes"
    slug = slugify(normalized["empresa"])
    collected_at = (state.get("discovery") or {}).get("completed_at") or now_iso()
    atomic_write_text(
        clientes_dir / f"{slug}.json",
        json.dumps(dossier, ensure_ascii=False, indent=2) + "\n",
    )
    atomic_write_text(
        clientes_dir / f"{slug}.md",
        render_discovery_dossier_markdown(dossier, collected_at),
    )


def segment_specific_memory_lines(segment: str, summary: str) -> list[str]:
    if segment == "saude":
        return [
            "Canal de agendamento: WhatsApp e agenda informados no discovery; detalhar com Catarina",
            f"Especialidades: {summary or 'a detalhar com Catarina'}",
            "Convênios aceitos: a detalhar com Catarina",
        ]
    if segment == "alimentacao":
        return [
            "Cardápio: a detalhar com Catarina",
            "Delivery próprio: a detalhar com Catarina",
            "Plataformas de delivery: a detalhar com Catarina",
        ]
    if segment == "varejo":
        return [
            "Catálogo: a detalhar com Catarina",
            "Política de troca: a detalhar com Catarina",
            "Faz entrega: a detalhar com Catarina",
        ]
    if segment == "beleza":
        return [
            "Canal de agendamento: WhatsApp e agenda informados no discovery; detalhar com Catarina",
            f"Lista de serviços: {summary or 'a detalhar com Catarina'}",
        ]
    if segment == "educacao":
        return [
            "Cursos oferecidos: a detalhar com Catarina",
            "Como faz matrícula: a detalhar com Catarina",
        ]
    if segment == "imobiliaria":
        return [
            "Tipos de imóvel: a detalhar com Catarina",
            "Como agenda visita: a detalhar com Catarina",
        ]
    return [
        "Como gera orçamento: a detalhar com Catarina",
        "Prazo padrão: a detalhar com Catarina",
    ]


def render_empresa_memory_from_state(state: dict, payload: dict) -> str:
    discovery = state.get("discovery") or {}
    owner = state.get("owner_captured") or {}
    summary = sanitize_long_text(discovery.get("summary") or "", SUMMARY_MAX_LEN)
    company = infer_company_name(state, payload)
    email = (owner.get("email") or "").strip().lower()
    whatsapp = sanitize_short_text(owner.get("whatsapp") or "", 30)
    owner_name = sanitize_short_text(owner.get("name") or "", NAME_MAX_LEN)
    if not company or not email or not whatsapp or not discovery.get("completed_at"):
        return ""

    segment = canonical_memory_segment(discovery.get("segment") or payload.get("segment"))
    validated_at = now_iso().split("T", 1)[0]
    description = summary or f"Empresa do segmento {segment} capturada no discovery da Sofia."

    lines = [
        "# Memória da empresa",
        "",
        f"Nome: {company}",
        f"Segmento: {segment}",
        f"Descrição: {description}",
        "Produtos ou serviços: a detalhar com Catarina",
        "Horário: a detalhar com Catarina",
        "Endereço: a detalhar com Catarina",
        "Regiões atendidas: a detalhar com Catarina",
        f"WhatsApp: {whatsapp}",
        f"Email: {email}",
        "Instagram: a detalhar com Catarina",
        "Site: a detalhar com Catarina",
        "Formas de pagamento: a detalhar com Catarina",
        "Pode falar preço: a detalhar com Catarina",
        "Faixa de preço: a detalhar com Catarina",
        "Quando chamar humano: a detalhar com Catarina",
        "Informações que nunca podem ser inventadas: dados não confirmados pelo dono",
        "Informações proibidas de falar: a detalhar com Catarina",
        f"Segmento detectado: {segment}",
        *segment_specific_memory_lines(segment, summary),
        f"Status da informação: validado pelo dono em {validated_at} (onboarding via discovery; aprofundamento com Catarina pendente)",
        "",
        "## Cadastro da empresa — concluído",
        "",
        f"- Responsável: {owner_name or 'a detalhar com Catarina'}",
        f"- E-mail de acesso: {email}",
        f"- WhatsApp do responsável: {whatsapp}",
    ]
    if summary:
        lines.append(f"- Resumo do discovery: {summary}")
    lines.extend([
        "",
        "## Pendências sinalizadas pro dono resolver",
        "",
        "- Catarina deve aprofundar equipe, casos de exceção, FAQ, histórico e regras tácitas antes da promoção final.",
    ])
    return "\n".join(lines).rstrip() + "\n"


def sync_empresa_memory_from_state(state: dict, payload: dict, workspace_root: Path) -> None:
    """Materializa memory/empresa.md quando Sofia fechou discovery mas o
    arquivo canônico continua no template. Isso torna onboarding.json e
    empresa.md convergentes sem depender de uma segunda escrita do LLM."""
    filled, _ = empresa_memory_filled(workspace_root)
    if filled:
        return
    content = render_empresa_memory_from_state(state, payload)
    if not content:
        return
    empresa_path = workspace_root / "memory" / "empresa.md"
    empresa_path.parent.mkdir(parents=True, exist_ok=True)
    empresa_path.write_text(content, encoding="utf-8")


def _lead_stale_days(state: dict) -> int | None:
    """Returns the number of full days since the last meaningful contact
    with the lead, or None when no outreach has happened yet (Catarina
    hasn't started OR last_outreach_at field is missing in legacy state).

    "Meaningful contact" = max(last_outreach_at, last_owner_response_at).
    Once Catarina sends an outreach we expect a response within
    LEAD_TIMEOUT_DAYS; if the response comes back, the clock resets.
    """
    deepening = state.get("deepening") or {}
    last_out = deepening.get("last_outreach_at")
    last_in = deepening.get("last_owner_response_at")
    # No outreach yet (still in discovery or pre-first-contact) → don't compute.
    if not last_out:
        return None
    latest_iso = max(filter(None, [last_out, last_in]))
    try:
        latest = datetime.strptime(latest_iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None
    delta = datetime.now(timezone.utc) - latest
    return max(delta.days, 0)


def recompute_phase_and_blockers(state: dict, workspace_root: Path | None = None) -> None:
    """Recalcula state.phase e state.promotion.blocked_by depois de qualquer mutação.

    workspace_root: passed by main() so we can do a ground-truth filesystem
    check on memory/empresa.md (audit P0 #6). When None (legacy callers
    that import this module without a workspace), the empresa.md check is
    skipped — the state-machine-only blockers still run.
    """
    blocked: list[str] = []

    if state["discovery"]["completed_at"] is None:
        blocked.append("discovery_incomplete")

    if not state["owner_captured"]["email"]:
        blocked.append("owner_email_missing")

    if not state["owner_captured"].get("whatsapp"):
        blocked.append("owner_whatsapp_missing")

    covered = set(state["deepening"]["areas_covered"])
    required = set(state["deepening"]["areas_required"])
    if not required.issubset(covered):
        missing = sorted(required - covered)
        blocked.append(f"deepening_incomplete: {','.join(missing)}")

    if workspace_root is not None:
        filled, reason = empresa_memory_filled(workspace_root)
        if not filled:
            blocked.append(f"empresa_memory_empty: {reason}")

    testing = state.get("testing") or {}
    if testing.get("status") == "in_test" and not testing.get("completed_at"):
        blocked.append("test_mode_in_progress")

    forced_completion = bool(state.get("deepening", {}).get("forced_completion_reason"))
    if (
        state["discovery"].get("completed_at")
        and not state["discovery"].get("agentes_recomendados")
        and not forced_completion
    ):
        blocked.append("agents_not_recommended")

    # P1 #17: surface stale-lead signal. Informational — never the SOLE
    # blocker, just appended when actual blockers already exist. If the
    # tenant is otherwise ready (no other blockers), the lead being slow
    # to respond shouldn't gate promotion.
    stale_days = _lead_stale_days(state)
    if stale_days is not None and stale_days >= LEAD_TIMEOUT_DAYS and blocked:
        blocked.append(f"lead_timeout_days: {stale_days}")

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
    # P1 #14: sanitize the LLM-provided strings before persisting. Name
    # field is capped + tag-stripped (sanitize_short_text); email goes
    # through regex validation; whatsapp is digit-stripped.
    name = sanitize_short_text(payload.get("name") or "", NAME_MAX_LEN)
    email = (payload.get("email") or "").strip().lower()
    whatsapp = (payload.get("whatsapp") or "").strip()
    captured_by = sanitize_short_text(payload.get("captured_by") or "sofia", 50) or "sofia"

    if not email:
        raise SystemExit("set_owner: email is required")
    if not EMAIL_RE.match(email):
        raise SystemExit(f"set_owner: email inválido: {email!r}")
    if len(email) > 320:  # RFC 3696 §3 ceiling — keeps DB column happy.
        raise SystemExit(f"set_owner: email exceeds 320 chars ({len(email)})")
    if whatsapp:
        digits = re.sub(r"\D", "", whatsapp)
        if len(digits) < WHATSAPP_DIGITS_MIN:
            raise SystemExit(
                f"set_owner: whatsapp tem {len(digits)} dígitos, mínimo {WHATSAPP_DIGITS_MIN}"
            )
        if len(digits) > 15:  # E.164 max
            raise SystemExit(
                f"set_owner: whatsapp tem {len(digits)} dígitos, máximo 15"
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
    # P1 #14: sanitize the LLM-provided segment + summary before persisting.
    segment_raw = payload.get("segment") or ""
    segment = sanitize_short_text(segment_raw, SEGMENT_MAX_LEN).lower() or None
    summary = sanitize_long_text(payload.get("summary") or "", SUMMARY_MAX_LEN) or None
    state["discovery"]["completed_at"] = now_iso()
    if segment:
        state["discovery"]["segment"] = segment
    if summary:
        state["discovery"]["summary"] = summary
    recommended = normalize_recommended(
        payload.get("agentes_recomendados") or payload.get("agents_recommended")
    )
    if recommended:
        state["discovery"]["agentes_recomendados"] = recommended
    # Auto-start deepening clock
    if state["deepening"]["started_at"] is None:
        state["deepening"]["started_at"] = now_iso()
    return state


def op_discovery_close(state: dict, payload: dict) -> dict:
    """Combina set_owner + mark_discovery_done numa escrita atômica.

    É a operação que o discovery-close determinístico usa: a Sofia (que em
    tenant publico roda como agente `main`, workspace raiz) grava UM arquivo
    `state/discovery-close.request.json` com este payload, e tanto o caminho
    inline (Messages API) quanto o cron `onboarding-discovery-close`
    (claude-cli) rodam `state.py --payload-file <esse arquivo>`.

    Requer o payload completo (empresa, segment, summary, owner.*). As
    escritas de `memory/empresa.md` e do dossiê acontecem em main(), depois
    desta mutação e antes do save de onboarding.json."""
    normalized = normalize_discovery_close_payload(payload)
    state = op_set_owner(state, normalized["owner"])
    state = op_mark_discovery_done(state, {
        "segment": normalized["segment"],
        "summary": normalized["summary"],
    })
    recommended = normalize_recommended(
        normalized["facts"].get("agentes_recomendados")
        or payload.get("agentes_recomendados")
        or payload.get("agents_recommended")
    )
    if recommended:
        state["discovery"]["agentes_recomendados"] = recommended
    events = (state.setdefault("audit", {})).setdefault("events", [])
    events.append({
        "at": now_iso(),
        "stage": sanitize_short_text(payload.get("stage") or "discovery_close", 80),
        "trace_id": sanitize_short_text(payload.get("trace_id") or "", 120) or None,
        "session_id": sanitize_short_text(payload.get("session_id") or "", 160) or None,
        "actor": sanitize_short_text(normalized.get("captured_by") or "sofia", 50) or "sofia",
    })
    if len(events) > 100:
        del events[:-100]
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
    # Calling first contact also counts as an outreach for the timeout clock.
    state["deepening"].setdefault("last_outreach_at", None)
    state["deepening"]["last_outreach_at"] = now_iso()
    state["deepening"]["last_bridge_error"] = None
    return state


def op_mark_bridge_attempt(state: dict, payload: dict) -> dict:
    state["deepening"].setdefault("last_bridge_attempt_at", None)
    state["deepening"].setdefault("last_bridge_failed_at", None)
    state["deepening"].setdefault("last_bridge_error", None)
    state["deepening"]["last_bridge_attempt_at"] = now_iso()
    state["deepening"]["last_bridge_error"] = None
    return state


def op_mark_bridge_failed(state: dict, payload: dict) -> dict:
    state["deepening"].setdefault("last_bridge_failed_at", None)
    state["deepening"].setdefault("last_bridge_error", None)
    state["deepening"]["last_bridge_failed_at"] = now_iso()
    state["deepening"]["last_bridge_error"] = sanitize_long_text(
        payload.get("error") or "unknown bridge error",
        500,
    )
    return state


def op_mark_outreach_sent(state: dict, payload: dict) -> dict:
    """Catarina chama TODA vez que envia uma mensagem WhatsApp pro lead.

    Audit P1 #17 (2026-05-27): sem esse timestamp não há como detectar
    deepening parado. O blocker `lead_timeout_days` no recompute usa
    este campo + `last_owner_response_at` pra sinalizar leads que não
    respondem há N dias.
    """
    state["deepening"].setdefault("last_outreach_at", None)
    state["deepening"]["last_outreach_at"] = now_iso()
    return state


def op_mark_owner_response(state: dict, payload: dict) -> dict:
    """Catarina chama no pré-turno SEMPRE que `verificar-respostas-jotaduo`
    retorna mensagens novas do lead. Marca que o lead está vivo.

    Audit P1 #17 (2026-05-27): par do `mark_outreach_sent`. Zera o
    timer de timeout — leads que responderam não disparam alerta.
    """
    state["deepening"].setdefault("last_owner_response_at", None)
    state["deepening"]["last_owner_response_at"] = now_iso()
    return state


def op_mark_area_complete(state: dict, payload: dict) -> dict:
    area = (payload.get("area") or "").strip().lower()
    area = AREA_ALIASES.get(area, area)
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


def op_finish_test(state: dict, payload: dict) -> dict:
    """Marca tenant privado pré-provisionado como pronto para produção.

    A troca de ui-visibility.json para profile="tenant" é feita pelo backend
    Go, que conhece o volume raiz. Esta operação só mantém o
    workspace/state/onboarding.json consistente para Pico Web e painel.
    """
    testing = state.setdefault("testing", {})
    testing.setdefault("started_at", now_iso())
    already_completed = bool(testing.get("completed_at"))
    if not testing.get("completed_at"):
        testing["completed_at"] = now_iso()
    if not already_completed:
        testing["completed_by"] = sanitize_short_text(
            payload.get("completed_by") or payload.get("actor") or "system",
            120,
        ) or "system"
        testing["completed_source"] = sanitize_short_text(
            payload.get("completed_source") or payload.get("source") or "system",
            40,
        ) or "system"
    testing["status"] = "production"
    events = (state.setdefault("audit", {})).setdefault("events", [])
    events.append({
        "at": now_iso(),
        "stage": "finish_test",
        "actor": testing["completed_by"],
        "source": testing["completed_source"],
    })
    if len(events) > 100:
        del events[:-100]
    return state


def op_get(state: dict, payload: dict) -> dict:
    return state


OPERATIONS = {
    "init": op_init,
    "set_owner": op_set_owner,
    "mark_discovery_done": op_mark_discovery_done,
    "discovery_close": op_discovery_close,
    "mark_bridge_attempt": op_mark_bridge_attempt,
    "mark_bridge_failed": op_mark_bridge_failed,
    "mark_first_contact": op_mark_first_contact,
    "mark_outreach_sent": op_mark_outreach_sent,
    "mark_owner_response": op_mark_owner_response,
    "mark_area_complete": op_mark_area_complete,
    "mark_ready_for_promotion": op_mark_ready_for_promotion,
    "mark_promoted": op_mark_promoted,
    "finish_test": op_finish_test,
    "get": op_get,
}


def read_raw_payload(argv: list[str]) -> str:
    """Lê o JSON da ação. Prioridade: --payload-file <path>, --json <str>,
    senão stdin.

    A tool `exec` do agente NÃO entrega stdin pra action="run" (o arg `data`
    só vale pra action="write" em sessão background — ver pkg/tools/shell.go),
    então quando Sofia/Catarina/Rafael chamam essa skill via `exec` eles
    DEVEM usar `--payload-file` (gravando o payload com write_file antes).
    O pipe de stdin continua funcionando pra chamadas via shell — o cron
    bridge-flow usa `echo '{...}' | state.py` e isso não muda."""
    if "--payload-file" in argv:
        idx = argv.index("--payload-file")
        if idx + 1 >= len(argv):
            raise SystemExit("--payload-file requer um caminho")
        path = Path(argv[idx + 1])
        if not path.is_file():
            raise SystemExit(f"--payload-file não encontrado: {path}")
        return path.read_text(encoding="utf-8").strip()
    if "--json" in argv:
        idx = argv.index("--json")
        if idx + 1 >= len(argv):
            raise SystemExit("--json requer uma string JSON")
        return argv[idx + 1].strip()
    return sys.stdin.read().strip()


def main() -> int:
    raw = read_raw_payload(sys.argv[1:])
    if not raw:
        raise SystemExit(
            "payload vazio — passe a ação via --payload-file <path>, "
            "--json '<str>', ou stdin"
        )
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SystemExit(f"payload não é JSON válido: {e}")

    action = payload.get("action")
    if action not in OPERATIONS:
        raise SystemExit(
            f"action inválida: {action!r}. Válidas: {sorted(OPERATIONS)}"
        )

    workspace_root = find_workspace_root(Path(__file__))
    state_path = workspace_root / "state" / "onboarding.json"
    # Lock covers the full read-modify-write (P1 #10). Stdout serialization
    # happens AFTER unlocking — by then `state` is a local dict copy and
    # other invocations can re-enter immediately.
    with locked_state_file(state_path):
        state = load_state(state_path)
        state = OPERATIONS[action](state, payload)
        if action == "discovery_close":
            write_discovery_close_outputs(state, payload, workspace_root)
        sync_empresa_memory_from_state(state, payload, workspace_root)
        recompute_phase_and_blockers(state, workspace_root)
        save_state(state_path, state)
    json.dump(state, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
