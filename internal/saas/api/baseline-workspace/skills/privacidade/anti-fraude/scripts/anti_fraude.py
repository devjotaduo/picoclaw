"""
anti-fraude — detecta padrões de golpe em texto e retorna avaliação de risco.
Lê JSON do stdin, escreve JSON no stdout.

Entrada: {"text": "...", "context": "opcional", "sender_id": "opcional"}
Saída:   {"fraud_detected": bool, "risk_level": "none|low|medium|high|critical",
           "triggers": [...], "handoff_required": bool, "recommended_action": "..."}
"""
import json
import re
import sys
import unicodedata

# (label, pattern, risk_level)
FRAUD_PATTERNS = [
    ("pix_urgente",          r"pix\s+(?:urgente|agora|imediato|r[aá]pido)",                         "critical"),
    ("transferencia_urgente",r"transfer[eê](?:ncia|ncias|ndo|ir)\s+(?:agora|urgente|hoje|imediato)", "critical"),
    ("senha_pedido",         r"(?:me\s+passa|fala|informe?)\s+(?:a\s+)?senha",                       "critical"),
    ("codigo_cartao",        r"c[oó]digo\s+(?:do\s+)?cart[aã]o",                                    "critical"),
    ("acesso_remoto",        r"acesso\s+remoto|teamviewer|anydesk|instalar\s+(?:um\s+)?app",         "high"),
    ("premio_falso",         r"(?:ganhou|ganhastr)\s+(?:um\s+)?pr[eê]mio|sorteado|contemplado",     "high"),
    ("liberacao_saldo",      r"libera[çc][aã]o\s+de\s+saldo|liberar\s+limite",                      "high"),
    ("link_suspeito",        r"clique\s+(?:aqui|no\s+link)|acesse\s+(?:esse|este|o)\s+link",        "medium"),
    ("dados_bancarios",      r"dados\s+banc[aá]rios|n[uú]mero\s+da\s+conta|ag[eê]ncia",            "medium"),
    ("evite_bloqueio",       r"evite?\s+(?:o\s+)?bloqueio|conta\s+(?:ser[aá]\s+)?bloqueada",        "medium"),
    ("chave_pix_sigilosa",   r"chave\s+pix\s+(?:sigilosa|secreta|exclusiva)",                       "high"),
    ("impersonacao_banco",   r"(?:banco|bradesco|ita[uú]|nubank|bb|caixa)\s+(?:aqui|informa|avisa)", "medium"),
]

RISK_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
RISK_ACTIONS = {
    "none":     "Nenhuma ação necessária.",
    "low":      "Monitorar. Clara pode informar que não solicitamos dados por WhatsApp.",
    "medium":   "Alertar Rafael. Não fornecer nenhum dado. Encerrar se insistir.",
    "high":     "Handoff imediato para Rafael. Registrar em state/audit/. Não continuar conversa.",
    "critical": "Handoff IMEDIATO. Bloquear solicitação. Alertar responsável humano. Registrar em state/audit/.",
}


def normalize(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()


def analyze(text: str) -> dict:
    text_norm = normalize(text)
    triggers = []
    max_risk = "none"

    for label, pattern, risk in FRAUD_PATTERNS:
        if re.search(pattern, text_norm, re.IGNORECASE):
            triggers.append({"type": label, "risk": risk})
            if RISK_ORDER[risk] > RISK_ORDER[max_risk]:
                max_risk = risk

    handoff_required = RISK_ORDER[max_risk] >= RISK_ORDER["high"]
    return {
        "fraud_detected": len(triggers) > 0,
        "risk_level": max_risk,
        "triggers": triggers,
        "handoff_required": handoff_required,
        "recommended_action": RISK_ACTIONS[max_risk],
        "audit_required": RISK_ORDER[max_risk] >= RISK_ORDER["medium"],
    }


def main() -> int:
    try:
        data = json.load(sys.stdin)
        text = data.get("text", "")
        if not isinstance(text, str):
            raise ValueError("campo 'text' deve ser string")
        result = analyze(text)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as e:
        # Em caso de erro, fail-safe: retornar como suspeito
        print(json.dumps({
            "error": str(e),
            "fraud_detected": True,
            "risk_level": "medium",
            "handoff_required": False,
            "recommended_action": "Erro na análise — tratar com cautela.",
        }), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
