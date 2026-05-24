#!/usr/bin/env python3
"""validate_workspace.py — tenant-liberation readiness probe.

Reads a tenant workspace's `memory/empresa.md`, infers what the tenant has
filled in (universal fields, segment-specific fields, and integration
pendencies), and prints a JSON readiness report to stdout. Exit code is 0
when the tenant is "ok" (everything resolved), 1 otherwise.

The companion `--mark-resolved <key>` flag updates a sidecar JSON file at
`<workspace>/memory/_meta/integracoes-resolved.json` so future validation
runs see that integration as resolved.

Stdlib-only. Python 3.8+.

Example:
    python validate_workspace.py --workspace /root/.picoclaw/workspace
    python validate_workspace.py --workspace /tmp/ws --mark-resolved whatsapp_business_api
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any, Dict, List, Tuple

# --- Segment-specific required fields ---------------------------------------

# Each entry maps a detected segment slug to the field-keys we expect the
# tenant to have filled in. The keys are case-insensitive and match a wide
# set of phrasings during scanning (see FIELD_ALIASES).
SEGMENT_REQUIREMENTS: Dict[str, List[str]] = {
    "saude": ["canal_agendamento", "especialidades", "convenios_ou_particular"],
    "alimentacao": ["cardapio_link", "delivery_definido", "plataformas_delivery"],
    "varejo": ["catalogo_link", "politica_troca", "faz_entrega"],
    "servicos": ["orcamento_processo", "prazo_padrao"],
    "beleza": ["canal_agendamento", "lista_servicos"],
    "educacao": ["cursos_oferecidos", "processo_matricula"],
    "imobiliaria": ["tipos_imovel", "processo_visita"],
}

# Phrases that should match each field-key when scanning markdown lines.
# Lowercased + accent-insensitive match (we strip accents in normalize()).
FIELD_ALIASES: Dict[str, List[str]] = {
    # Universal
    "nome": ["nome", "razao social", "empresa"],
    "segmento": ["segmento detectado", "segmento"],
    "contato_email": ["email", "e-mail", "contato email"],
    "contato_whatsapp": ["whatsapp", "telefone", "celular", "contato whatsapp"],
    # Saude / Beleza
    "canal_agendamento": ["canal de agendamento", "agendamento", "como agenda"],
    "especialidades": ["especialidades", "especialidade"],
    "convenios_ou_particular": ["convenios", "convenios aceitos", "convenio aceito", "particular", "convenio ou particular", "formas de atendimento"],
    "lista_servicos": ["lista de servicos", "servicos oferecidos", "servicos"],
    # Alimentacao
    "cardapio_link": ["cardapio", "menu"],
    "delivery_definido": ["delivery"],
    "plataformas_delivery": ["plataformas de delivery", "ifood", "rappi", "uber eats"],
    # Varejo
    "catalogo_link": ["catalogo", "loja online"],
    "politica_troca": ["politica de troca", "trocas", "devolucao"],
    "faz_entrega": ["entrega", "frete"],
    # Servicos
    "orcamento_processo": ["orcamento", "como cobra", "processo de orcamento"],
    "prazo_padrao": ["prazo", "prazo padrao", "sla"],
    # Educacao
    "cursos_oferecidos": ["cursos", "cursos oferecidos", "programa"],
    "processo_matricula": ["matricula", "inscricao", "processo de matricula"],
    # Imobiliaria
    "tipos_imovel": ["tipos de imovel", "imoveis", "tipo de imovel"],
    "processo_visita": ["visita", "agendar visita", "processo de visita"],
}

# Integration keywords detected in "Pendencias" / "integracoes_necessarias"
# section of empresa.md. Each tuple: (aliases, key, admin_action, blocking).
#
# `blocking=True`  → entra em integracoes_required[] e bloqueia liberação.
#                    Use pra integrações TÉCNICAS que exigem configuração
#                    externa pelo operador (API key, OAuth, ERP, EHR, etc.)
# `blocking=False` → entra em integracoes_informativas[] como aviso ao
#                    admin, MAS não bloqueia liberação. Use pra coisas
#                    que o cliente configura SOZINHO pelo painel quando
#                    quiser ativar o canal (WhatsApp, Instagram, etc.)
INTEGRATION_PATTERNS: List[Tuple[List[str], str, str, bool]] = [
    # Não-bloqueantes — canais que o cliente configura pelo painel quando
    # ativar (Picoclaw já suporta WhatsApp nativo + Instagram via canais)
    (["whatsapp business", "whatsapp business api", "wa business", "whatsapp"],
     "whatsapp_business_api",
     "Cliente configura no painel (canal WhatsApp)",
     False),
    (["instagram", "ig direct", "ig dm"],
     "instagram",
     "Cliente conecta no painel (canal Instagram)",
     False),

    # Bloqueantes — sistemas externos de OPERAÇÃO. Sem eles, equipe não
    # consegue atender clientes sem inventar/redirecionar manualmente.

    # Clínico / saúde
    (["shosp"], "shosp", "Configure integração Shosp (agenda clínica)", True),
    (["iclinic", "i-clinic"], "iclinic", "Configure iClinic EHR", True),
    (["doctoralia"], "doctoralia", "Configure Doctoralia", True),
    (["feegow"], "feegow", "Configure Feegow", True),
    (["tasy"], "tasy", "Configure Tasy", True),
    (["memed"], "memed", "Configure Memed (receita digital)", True),

    # Agenda
    (["google calendar", "calendario google"],
     "google_calendar", "Configure Google Calendar", True),
    (["calendly"], "calendly", "Configure Calendly", True),
    (["outlook calendar"], "outlook_calendar", "Configure Outlook Calendar", True),

    # CRM
    (["pipedrive"], "crm_pipedrive", "Configure CRM Pipedrive", True),
    (["hubspot"], "crm_hubspot", "Configure CRM HubSpot", True),
    (["rd station", "rdstation"], "crm_rdstation", "Configure RD Station", True),
    (["salesforce"], "crm_salesforce", "Configure Salesforce", True),
    (["zoho crm", "zoho"], "crm_zoho", "Configure Zoho CRM", True),

    # ERP / financeiro
    (["bling"], "erp_bling", "Configure ERP Bling", True),
    (["tiny erp", "tiny"], "erp_tiny", "Configure ERP Tiny", True),
    (["omie"], "erp_omie", "Configure ERP Omie", True),
    (["conta azul", "contaazul"], "erp_contaazul", "Configure Conta Azul", True),
    ([" sap ", "sap erp", "sap b1"], "erp_sap", "Configure SAP", True),

    # Pagamento
    (["asaas"], "payment_asaas", "Configure Asaas (cobrança)", True),
    (["stripe"], "payment_stripe", "Configure Stripe", True),
    (["mercado pago", "mercadopago"], "payment_mercadopago",
     "Configure Mercado Pago", True),
    (["pagseguro"], "payment_pagseguro", "Configure PagSeguro", True),
    (["pagar.me", "pagarme"], "payment_pagarme", "Configure Pagar.me", True),

    # E-commerce
    (["shopify"], "ecommerce_shopify", "Configure Shopify", True),
    (["nuvemshop", "nuvem shop"], "ecommerce_nuvemshop",
     "Configure Nuvemshop", True),
    (["woocommerce"], "ecommerce_woocommerce", "Configure WooCommerce", True),
    (["tray "], "ecommerce_tray", "Configure Tray", True),  # space evita match em palavras
    (["vtex"], "ecommerce_vtex", "Configure VTEX", True),
    (["magento"], "ecommerce_magento", "Configure Magento", True),

    # Genérico — captura "banco de dados", "sistema próprio", "API X"
    (["banco de dados", "database", "db proprio", "db próprio"],
     "external_database",
     "Configure integração com banco de dados externo", True),
    (["sistema proprio", "sistema próprio", "sistema interno"],
     "external_system_internal",
     "Configure integração com sistema interno do cliente", True),
    (["erp"], "erp_generic", "Configure ERP (sistema não identificado)", True),
    (["crm"], "crm_generic", "Configure CRM (sistema não identificado)", True),
]

# Generic regex fallback: catches "integração com X", "conectar X",
# "API de X", "API do X" mentions in pendências section. These become
# blocking entries with key=external_system_<slug>.
GENERIC_INTEGRATION_RE = re.compile(
    r"(?:integra[cç][aã]o\s+com|conectar(?:\s+ao?)?|api\s+(?:de|do|da)|"
    r"plugar(?:\s+ao?)?|sincroni[zs]ar\s+com)\s+([a-zA-Z0-9][\w\.\- ]{1,40})",
    flags=re.IGNORECASE,
)


# --- Helpers ----------------------------------------------------------------

def normalize(s: str) -> str:
    """Lowercase + strip common Portuguese accents for fuzzy matching."""
    s = s.lower().strip()
    repl = str.maketrans("áàâãäéèêëíìîïóòôõöúùûüç", "aaaaaeeeeiiiiooooouuuuc")
    return s.translate(repl)


def read_empresa_md(workspace: str) -> str:
    """Read memory/empresa.md if present; return empty string otherwise."""
    path = os.path.join(workspace, "memory", "empresa.md")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except FileNotFoundError:
        return ""
    except OSError:
        return ""


def extract_field(text: str, key: str) -> bool:
    """Return True if any alias for `key` appears as a populated field.

    A field is "populated" when a line contains an alias followed by `:` (or
    `-` / `=`) and at least one non-whitespace character after it that isn't
    a placeholder like "(...)", "<...>", "TBD", or "todo".
    """
    aliases = FIELD_ALIASES.get(key, [key])
    norm_lines = [normalize(line) for line in text.splitlines()]
    placeholders = {"", "-", "tbd", "todo", "n/a", "na", "preencher", "?", "??"}

    for raw_line, line in zip(text.splitlines(), norm_lines):
        for alias in aliases:
            # match alias followed by separator
            m = re.search(rf"\b{re.escape(alias)}\b\s*[:\-=]\s*(.*)$", line)
            if not m:
                continue
            value = m.group(1).strip()
            # strip surrounding markdown markers (**, *, _, `)
            value = re.sub(r"[*_`]+", "", value).strip()
            if not value or value in placeholders:
                return False
            # strip placeholder wrappers
            if re.fullmatch(r"[(\[<].*[)\]>]", value):
                return False
            return True
    return False


def detect_segment(text: str) -> str:
    """Find the segment declared via 'Segmento detectado: <slug>' or
    'Segmento: <slug>'. Returns "" when none is found."""
    norm = normalize(text)
    m = re.search(r"segmento detectado\s*[:\-]\s*([a-z]+)", norm)
    if not m:
        m = re.search(r"segmento\s*[:\-]\s*([a-z]+)", norm)
    if not m:
        return ""
    seg = m.group(1).strip()
    # accept either canonical or close variants
    canonical = {
        "saude": "saude", "saúde": "saude",
        "alimentacao": "alimentacao", "alimentação": "alimentacao",
        "varejo": "varejo",
        "servicos": "servicos", "serviços": "servicos", "servico": "servicos",
        "beleza": "beleza", "estetica": "beleza",
        "educacao": "educacao", "educação": "educacao",
        "imobiliaria": "imobiliaria", "imovel": "imobiliaria",
    }
    return canonical.get(seg, seg)


def extract_pendencias_block(text: str) -> str:
    """Return the slice of text inside the 'Pendencias' or
    'integracoes_necessarias' section (until the next H2/H1 heading or EOF)."""
    # Locate header
    pattern = re.compile(
        r"(?im)^\s*(##+\s*(?:pend[eê]ncias[^\n]*|integracoes_necessarias[^\n]*))\s*$"
    )
    m = pattern.search(text)
    if not m:
        # also try inline tags
        m = re.search(r"(?i)integracoes_necessarias\s*[:\-]", text)
        if not m:
            return ""
        return text[m.end():]

    start = m.end()
    # Find next heading at same or higher level
    next_h = re.search(r"(?m)^\s*#{1,3}\s+\S", text[start:])
    if next_h:
        return text[start : start + next_h.start()]
    return text[start:]


def detect_integrations(text: str, resolved: set) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """Scan the pendencias block for integration keywords and return
    (blocking, informativas) lists. Blocking entries gate liberation.
    Informativas only inform the admin — they don't block.

    Each entry has key, status (pending/resolved), admin_action."""
    block = extract_pendencias_block(text)
    if not block:
        return [], []
    norm = normalize(block)
    blocking: List[Dict[str, str]] = []
    informativas: List[Dict[str, str]] = []
    seen = set()

    # 1. Match known providers (specific aliases)
    for keywords, key, admin_action, is_blocking in INTEGRATION_PATTERNS:
        if key in seen:
            continue
        for kw in keywords:
            if kw in norm:
                status = "resolved" if key in resolved else "pending"
                entry = {
                    "key": key,
                    "status": status,
                    "admin_action": admin_action,
                }
                if is_blocking:
                    blocking.append(entry)
                else:
                    informativas.append(entry)
                seen.add(key)
                break

    # 2. Generic fallback — catch "integração com X" / "conectar X" / "API de X"
    # mentions that didn't match any specific provider above. These become
    # blocking entries since unrecognized external systems must be reviewed.
    for match in GENERIC_INTEGRATION_RE.finditer(block):
        raw_name = match.group(1).strip().lower()
        # Slug: keep alphanumerics + dash
        slug = re.sub(r"[^a-z0-9]+", "_", raw_name).strip("_")[:30]
        if not slug:
            continue
        key = f"external_system_{slug}"
        # Skip if already captured by specific pattern (heuristic: provider
        # name appears in any already-seen key)
        if any(slug in s or s in slug for s in seen):
            continue
        if key in seen:
            continue
        status = "resolved" if key in resolved else "pending"
        blocking.append({
            "key": key,
            "status": status,
            "admin_action": f"Configure integração com {raw_name} (sistema externo identificado em pendências)",
        })
        seen.add(key)

    return blocking, informativas


def load_resolved(workspace: str) -> set:
    path = os.path.join(workspace, "memory", "_meta", "integracoes-resolved.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return set()
    if isinstance(data, dict) and isinstance(data.get("resolved"), list):
        return {str(x) for x in data["resolved"]}
    if isinstance(data, list):
        return {str(x) for x in data}
    return set()


def save_resolved(workspace: str, resolved: set) -> None:
    meta_dir = os.path.join(workspace, "memory", "_meta")
    os.makedirs(meta_dir, exist_ok=True)
    path = os.path.join(meta_dir, "integracoes-resolved.json")
    payload = {"resolved": sorted(resolved)}
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)


# --- Main -------------------------------------------------------------------

def build_report(workspace: str) -> Dict[str, Any]:
    text = read_empresa_md(workspace)
    resolved = load_resolved(workspace)

    universal_keys = ["nome", "segmento", "contato_email", "contato_whatsapp"]
    universal = {k: extract_field(text, k) for k in universal_keys}

    segment = detect_segment(text)
    seg_key = f"segmento_{segment}" if segment else "segmento_unknown"
    seg_checks: Dict[str, bool] = {}
    if segment and segment in SEGMENT_REQUIREMENTS:
        for field in SEGMENT_REQUIREMENTS[segment]:
            seg_checks[field] = extract_field(text, field)

    integrations_blocking, integrations_info = detect_integrations(text, resolved)

    # Build missing_summary — só conta universal + segmento + blocking
    missing: List[str] = [k for k, ok in universal.items() if not ok]
    for field, ok in seg_checks.items():
        if not ok:
            missing.append(f"{seg_key}.{field}")
    for entry in integrations_blocking:
        if entry["status"] != "resolved":
            missing.append(f"integracao.{entry['key']}")

    ok = (
        all(universal.values())
        and (not seg_checks or all(seg_checks.values()))
        and all(e["status"] == "resolved" for e in integrations_blocking)
    )

    report: Dict[str, Any] = {
        "ok": ok,
        "universal": universal,
        seg_key: seg_checks,
        "integracoes_required": integrations_blocking,
        "integracoes_informativas": integrations_info,
        "missing_summary": missing,
    }
    return report


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Validate a tenant workspace's onboarding readiness."
    )
    parser.add_argument(
        "--workspace", "--workspace-root", dest="workspace", required=True,
        help="Path to the tenant workspace root (contains memory/empresa.md).",
    )
    parser.add_argument(
        "--mark-resolved", default=None, metavar="KEYS",
        help="Mark integration key(s) as resolved (comma-separated, writes sidecar) before validating.",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Emit JSON output (default behavior; flag kept for explicit callers).",
    )
    args = parser.parse_args(argv)

    workspace = os.path.abspath(args.workspace)
    if not os.path.isdir(workspace):
        sys.stderr.write(f"workspace not found: {workspace}\n")
        return 2

    if args.mark_resolved:
        resolved = load_resolved(workspace)
        for key in args.mark_resolved.split(","):
            key = key.strip()
            if key:
                resolved.add(key)
        save_resolved(workspace, resolved)

    report = build_report(workspace)
    json.dump(report, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
