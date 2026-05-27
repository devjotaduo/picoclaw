
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

from datetime import date


def compute_billing_action(payload: dict) -> dict:
    require(payload, ["invoice_id", "customer_id", "due_date", "status", "today"])
    if payload["status"] == "paid":
        action = "none"
    else:
        due = date.fromisoformat(payload["due_date"])
        today = date.fromisoformat(payload["today"])
        delta = (due - today).days
        overdue = (today - due).days
        if delta == 3:
            action = "reminder"
        elif delta == 0:
            action = "due_today"
        elif overdue >= 7:
            action = "handoff-human"
        elif overdue >= 3:
            action = "overdue_notice"
        else:
            action = "none"
    return {"invoice_id": payload["invoice_id"], "customer_id": payload["customer_id"], "action": action}


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute billing cycle action.")
    parser.parse_args()
    try:
        data = read_json_stdin()
        reject_sensitive_keys(data)
        write_json_stdout(compute_billing_action(data))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
