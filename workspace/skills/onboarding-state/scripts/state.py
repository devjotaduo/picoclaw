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


def sanitize_short_text(value: str, max_len: int = NAME_MAX_LEN) -> str:
    """Strip control chars + HTML-ish tags from a single-line field and
    truncate. Returns empty when input is empty/whitespace. Use for owner
    name, segment, etc. — fields where newlines should not survive."""
    if not value:
        return ""
    cleaned = _CONTROL_CHAR_RE.sub("", value)
    cleaned = _TAG_LIKE_RE.sub("", cleaned).strip()
    return cleaned[:max_len]


def sanitize_long_text(value: str, max_len: int = SUMMARY_MAX_LEN) -> str:
    """Like sanitize_short_text but preserves newlines (Sofia's discovery
    summary may be multi-line). Still strips other control chars + tags."""
    if not value:
        return ""
    # Keep \n + \t; strip everything else in 0x00-0x1f.
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    cleaned = _TAG_LIKE_RE.sub("", cleaned).strip()
    return cleaned[:max_len]


# Audit P1 #13: bump SCHEMA_VERSION whenever required fields are added so
# old state.json files get migrated lazily on load (`migrate_state`)
# instead of silently breaking parsers. Don't change semantics of an
# existing version — bump and migrate.
SCHEMA_VERSION = 3


def migrate_state(state: dict) -> dict:
    """Lazy upgrade of older state shapes to SCHEMA_VERSION. Idempotent.

    v1 -> v2: adds deepening.first_contact_at, .last_outreach_at,
             .last_owner_response_at. Pre-v1 state (no schema_version
             key) is treated as v1.
    v2 -> v3: adds bridge attempt/failure observability so the Sofia ->
             Catarina bridge can retry safely after WhatsApp send errors.
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
    state["schema_version"] = SCHEMA_VERSION
    return state


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
        "schema_version": SCHEMA_VERSION,
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

    Idempotente: re-rodar com os mesmos dados só atualiza timestamps. Exige
    email (via op_set_owner); segment/summary são opcionais."""
    state = op_set_owner(state, payload)
    state = op_mark_discovery_done(state, payload)
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
        sync_empresa_memory_from_state(state, payload, workspace_root)
        recompute_phase_and_blockers(state, workspace_root)
        save_state(state_path, state)
    json.dump(state, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
