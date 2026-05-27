
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

def calendar_action(workspace_root: Path, payload: dict) -> dict:
    action = payload.get("action")
    path = workspace_root / "memory" / "jotaduo" / "calendar" / "events.json"
    events = read_json_file(path, {})
    if action == "create":
        require(payload, ["idempotency_key", "title", "start", "end", "contact_id"])
        event_id = stable_id("cal", payload["idempotency_key"])
        events[event_id] = {"event_id": event_id, "title": payload["title"], "start": payload["start"], "end": payload["end"], "contact_id": payload["contact_id"], "status": "scheduled", "idempotency_key": payload["idempotency_key"]}
        write_json_file(path, events)
        return events[event_id]
    if action == "update":
        require(payload, ["event_id"])
        if payload["event_id"] not in events:
            raise ValueError("event not found")
        events[payload["event_id"]].update({k: v for k, v in payload.items() if k not in {"workspace_root", "action"}})
        write_json_file(path, events)
        return events[payload["event_id"]]
    if action == "cancel":
        require(payload, ["event_id"])
        if payload["event_id"] not in events:
            raise ValueError("event not found")
        events[payload["event_id"]]["status"] = "cancelled"
        write_json_file(path, events)
        return events[payload["event_id"]]
    if action == "list":
        return {"events": list(events.values())}
    raise ValueError("invalid action")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run local calendar operations.")
    parser.parse_args()
    try:
        data = read_json_stdin()
        reject_sensitive_keys(data)
        write_json_stdout(calendar_action(find_workspace_root(data.get("workspace_root")), data))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
