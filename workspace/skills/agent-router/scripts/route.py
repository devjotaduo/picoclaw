
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

SENSITIVE_KEYS = {"password", "token", "secret", "api_key", "private_key", "cpf", "card_number", "cvv"}


def read_json_stdin() -> dict:
    data = json.load(sys.stdin)
    if not isinstance(data, dict):
        raise ValueError("stdin JSON must be an object")
    return data


def write_json_stdout(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def reject_sensitive_keys(payload) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if str(key).lower() in SENSITIVE_KEYS:
                raise ValueError("sensitive key rejected")
            reject_sensitive_keys(value)
    elif isinstance(payload, list):
        for item in payload:
            reject_sensitive_keys(item)


def find_workspace_root(explicit=None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    start = Path.cwd().resolve()
    for candidate in [start, *start.parents]:
        if (candidate / "AGENT.md").exists() and (candidate / "memory").is_dir():
            return candidate
    return start


def stable_id(prefix: str, key: str) -> str:
    return prefix + "_" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def require(data: dict, keys) -> None:
    missing = [key for key in keys if data.get(key) in (None, "")]
    if missing:
        raise ValueError("missing required keys: " + ", ".join(missing))


def read_json_file(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_file(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii").lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "-", ascii_only)
    ascii_only = re.sub(r"-+", "-", ascii_only).strip("-")
    return ascii_only or "cliente"

ROUTES = [
    ("agente-cobranca",    "Paulo",   ["boleto", "cobrança", "cobranca", "pagar", "pagamento", "vencimento",
                                       "segunda via", "debito", "débito", "atrasado", "atraso", "fatura",
                                       "boletto", "cobranca", "assinatura", "cancelar assinatura",
                                       "cancelar plano", "cancelar contrato", "cancelar servico",
                                       "cancelar serviço"]),
    ("agente-agendador",   "Ana",     ["agenda", "agendar", "marcar horario", "marcar consulta", "remarcar",
                                       "cancelar consulta", "cancelar agendamento", "horario", "horário",
                                       "consulta", "reserva", "agendamento", "remarcar consulta"]),
    ("agente-suporte",     "Camila",  ["problema", "erro", "não funciona", "nao funciona", "reclamacao",
                                       "reclamação", "defeito", "ajuda técnica", "bugou", "travou",
                                       "quebrou", "nao ta funcionando"]),
    ("agente-vendedor",    "Marcos",  ["orcamento", "orçamento", "preco", "preço", "comprar", "contratar",
                                       "plano", "proposta", "valor", "quanto custa", "quero contratar",
                                       "assinar", "pacote"]),
    ("agente-qualificador","Diego",   ["tenho interesse", "quero saber mais", "falar com comercial",
                                       "fui indicado", "vi no instagram", "vi no site", "vi no linkedin",
                                       "me indicaram", "quero conhecer"]),
    ("agente-pos-venda",   "Beatriz", ["satisfação", "satisfacao", "avaliação", "avaliacao", "nota",
                                       "como foi", "experiência", "experiencia", "feedback", "avaliar"]),
]

# Fraud patterns → always trigger handoff + anti-fraude check
FRAUD_SIGNALS = [
    "pix urgente", "transferir agora", "senha do", "código do cartão", "codigo do cartao",
    "acesso remoto", "baixar aplicativo", "ganhou um prêmio", "ganhou um premio",
    "liberação de saldo", "liberacao de saldo", "clique no link", "confirme seus dados bancários",
    "confirme seus dados bancarios", "evite bloqueio", "chave pix sigilosa",
]

SEGMENT_PRIORITY = {
    "clinica":   ("agente-agendador",  "Ana"),
    "ecommerce": ("agente-suporte",    "Camila"),
    "educacao":  ("agente-agendador",  "Ana"),
    "vendas":    ("agente-vendedor",   "Marcos"),
    "servicos":  ("agente-recepcionista", "Clara"),
}

# Human handoff — expanded to cover natural language variants
HUMAN_KEYWORDS = [
    "falar com humano", "falar com pessoa", "falar com uma pessoa", "falar com atendente",
    "atendente humano", "quero pessoa", "quero falar com alguem", "quero falar com alguém",
    "me passa para um atendente", "passar para humano", "fale com um humano",
    "atendimento humano", "ser atendido por pessoa",
]


def _normalize(text: str) -> str:
    """Lowercase + strip accents for fuzzy matching."""
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii").lower()


def route_message(message_text: str, customer_segment: str = "", conversation_state=None, available_agents=None) -> dict:
    text = (message_text or "").lower()
    text_norm = _normalize(text)

    # PII check signal — expande para incluir variações sem acento
    pii_raw = ["cpf", "rg ", "cartão", "cartao", "senha", "código", "codigo", "pix", "chave pix", "token"]
    pii_check = any(p in text or p in text_norm for p in pii_raw)

    # Fraud signals — always handoff + anti-fraude check
    fraud_detected = any(_normalize(f) in text_norm for f in FRAUD_SIGNALS)
    if fraud_detected:
        return {
            "agent_id": "handoff-human",
            "agent_name": "Atendimento Humano",
            "confidence": 1.0,
            "reason": "fraud signal detected",
            "handoff_required": True,
            "pii_check_required": True,
            "anti_fraude_required": True,
        }

    # Explicit human request
    if any(_normalize(kw) in text_norm for kw in HUMAN_KEYWORDS):
        return {
            "agent_id": "handoff-human",
            "agent_name": "Atendimento Humano",
            "confidence": 1.0,
            "reason": "explicit human request",
            "handoff_required": True,
            "pii_check_required": pii_check,
            "anti_fraude_required": False,
        }

    # Keyword routing — use normalized text for typo resilience
    for agent_id, agent_name, words in ROUTES:
        if any(_normalize(w) in text_norm for w in words):
            return {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "confidence": 0.9,
                "reason": "matched route keywords",
                "handoff_required": False,
                "pii_check_required": pii_check,
                "anti_fraude_required": False,
            }

    # Segment-based priority fallback
    if customer_segment and customer_segment in SEGMENT_PRIORITY:
        fallback_id, fallback_name = SEGMENT_PRIORITY[customer_segment]
        return {
            "agent_id": fallback_id,
            "agent_name": fallback_name,
            "confidence": 0.65,
            "reason": f"segment default: {customer_segment}",
            "handoff_required": False,
            "pii_check_required": pii_check,
            "anti_fraude_required": False,
        }

    return {
        "agent_id": "agente-recepcionista",
        "agent_name": "Clara",
        "confidence": 0.55,
        "reason": "default route",
        "handoff_required": False,
        "pii_check_required": pii_check,
        "anti_fraude_required": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Route a Jotaduo message to the best agent.")
    parser.parse_args()
    try:
        data = read_json_stdin()
        reject_sensitive_keys(data)
        result = route_message(data.get("message_text", ""), data.get("customer_segment", ""), data.get("conversation_state", {}), data.get("available_agents", []))
        write_json_stdout(result)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
