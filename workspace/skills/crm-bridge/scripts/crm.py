
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

def crm_action(workspace_root: Path, payload: dict) -> dict:
    action = payload.get("action")
    path = workspace_root / "memory" / "jotaduo" / "crm" / "records.json"
    db = read_json_file(path, {"contacts": {}, "deals": {}, "notes": []})
    if action == "upsert_contact":
        identifier = payload.get("contact_id") or payload.get("email") or payload.get("idempotency_key")
        if not identifier:
            raise ValueError("contact_id or email required")
        contact_id = payload.get("contact_id") or stable_id("contact", identifier)
        record = db["contacts"].get(contact_id, {})
        record.update({k: v for k, v in payload.items() if k not in {"workspace_root", "action"}})
        record["contact_id"] = contact_id
        db["contacts"][contact_id] = record
        write_json_file(path, db)
        return record
    if action == "get_contact":
        require(payload, ["contact_id"])
        return db["contacts"].get(payload["contact_id"], {"contact_id": payload["contact_id"], "status": "not_found"})
    if action == "create_deal":
        require(payload, ["idempotency_key", "contact_id", "title"])
        deal_id = stable_id("deal", payload["idempotency_key"])
        db["deals"][deal_id] = {"deal_id": deal_id, "contact_id": payload["contact_id"], "title": payload["title"], "stage": payload.get("stage", "new")}
        write_json_file(path, db)
        return db["deals"][deal_id]
    if action == "move_stage":
        require(payload, ["deal_id", "stage"])
        if payload["deal_id"] not in db["deals"]:
            raise ValueError("deal not found")
        db["deals"][payload["deal_id"]]["stage"] = payload["stage"]
        write_json_file(path, db)
        return db["deals"][payload["deal_id"]]
    if action == "add_note":
        require(payload, ["contact_id", "note"])
        note = {"contact_id": payload["contact_id"], "note": payload["note"], "created_at": now_iso()}
        db["notes"].append(note)
        write_json_file(path, db)
        return note
    raise ValueError("invalid action")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run local CRM bridge actions.")
    parser.parse_args()
    try:
        data = read_json_stdin()
        reject_sensitive_keys(data)
        write_json_stdout(crm_action(find_workspace_root(data.get("workspace_root")), data))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
