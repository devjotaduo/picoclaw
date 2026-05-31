#!/usr/bin/env python3
"""crm-bridge — CRM local por tenant, em SQLite.

Cada tenant roda no seu próprio container/volume, então este CRM vive num
único arquivo SQLite dentro do workspace do tenant
(`<workspace_root>/memory/crm/crm.db`). Isolamento é grátis: o container só
enxerga o próprio volume. Não há rede, não há controlplane, não há tenant_id.

O agente do tenant chama a skill passando UMA ação JSON no stdin; o script
devolve UM objeto JSON no stdout (ou um erro estruturado + exit!=0).

Recursos (tabelas): contacts, deals, activities (timeline/notas), counters
(métricas que o agente incrementa). Métricas de relatório são agregados ao
vivo + os counters.

Ações:
  Contatos : upsert_contact, get_contact, list_contacts
  Deals    : create_deal, move_stage, get_deal, list_deals
  Atividade: add_note (alias add_activity), list_activities
  Métricas : bump_metric, metrics

Compat: as ações antigas (upsert_contact/get_contact/create_deal/move_stage/
add_note) seguem funcionando. Na primeira execução, se existir o JSON legado
`memory/jotaduo/crm/records.json`, ele é importado uma vez pro SQLite.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

# Chaves que nunca devem ser persistidas (LGPD / segurança). Espelha o
# comportamento da versão antiga + a skill onboarding-state.
SENSITIVE_KEYS = {
    "password",
    "token",
    "secret",
    "api_key",
    "private_key",
    "cpf",
    "cnpj",
    "card_number",
    "cvv",
}

VALID_CONTACT_STATUS = {"lead", "prospect", "customer", "lost"}
VALID_DEAL_STAGES = {"new", "qualified", "proposal", "won", "lost"}
VALID_ACTIVITY_TYPES = {
    "note",
    "msg_in",
    "msg_out",
    "call",
    "meeting",
    "stage_change",
    "task",
}

# Campos livres que o agente pode mandar em upsert_contact e que viram colunas
# de verdade. Qualquer outra chave vai pro extra_json.
CONTACT_COLUMNS = {"name", "email", "phone", "company", "source", "status", "tags"}

NAME_MAX_LEN = 200
TEXT_MAX_LEN = 4000
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TAG_LIKE_RE = re.compile(r"<[^>]+>")


# --------------------------------------------------------------------------- #
# IO helpers
# --------------------------------------------------------------------------- #
def read_json_stdin() -> dict:
    data = json.load(sys.stdin)
    if not isinstance(data, dict):
        raise ValueError("stdin JSON must be an object")
    return data


def write_json_stdout(payload) -> None:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def reject_sensitive_keys(payload) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if str(key).lower() in SENSITIVE_KEYS:
                raise ValueError("sensitive key rejected: " + str(key))
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


def current_period() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m")


def require(data: dict, keys) -> None:
    missing = [key for key in keys if data.get(key) in (None, "")]
    if missing:
        raise ValueError("missing required keys: " + ", ".join(missing))


def clean_text(value, max_len: int = NAME_MAX_LEN, keep_newlines: bool = False) -> str:
    """Strip control chars + HTML-ish tags e trunca. Defesa em profundidade
    contra texto controlado por usuário/LLM antes de tocar o disco."""
    if value is None:
        return ""
    text = str(value)
    text = _TAG_LIKE_RE.sub("", text)
    if keep_newlines:
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    else:
        text = _CONTROL_CHAR_RE.sub("", text)
    return text.strip()[:max_len]


# --------------------------------------------------------------------------- #
# DB
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS contacts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL DEFAULT '',
    phone       TEXT NOT NULL DEFAULT '',
    company     TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'manual',
    status      TEXT NOT NULL DEFAULT 'lead',
    tags        TEXT NOT NULL DEFAULT '',
    extra_json  TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_email  ON contacts(email);

CREATE TABLE IF NOT EXISTS deals (
    id          TEXT PRIMARY KEY,
    contact_id  TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    stage       TEXT NOT NULL DEFAULT 'new',
    value_cents INTEGER NOT NULL DEFAULT 0,
    currency    TEXT NOT NULL DEFAULT 'BRL',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    closed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage   ON deals(stage);

CREATE TABLE IF NOT EXISTS activities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id  TEXT,
    deal_id     TEXT,
    type        TEXT NOT NULL DEFAULT 'note',
    body        TEXT NOT NULL DEFAULT '',
    actor       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activities_deal    ON activities(deal_id, created_at);

CREATE TABLE IF NOT EXISTS counters (
    key         TEXT NOT NULL,
    period      TEXT NOT NULL DEFAULT 'all',
    value       INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (key, period)
);
"""


def db_path(workspace_root: Path) -> Path:
    return workspace_root / "memory" / "crm" / "crm.db"


def connect(workspace_root: Path) -> sqlite3.Connection:
    path = db_path(workspace_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    maybe_import_legacy(conn, workspace_root)
    return conn


def row_to_contact(row: sqlite3.Row) -> dict:
    out = dict(row)
    try:
        out["extra"] = json.loads(out.pop("extra_json", "{}") or "{}")
    except (ValueError, TypeError):
        out["extra"] = {}
    out["contact_id"] = out["id"]
    return out


def row_to_deal(row: sqlite3.Row) -> dict:
    out = dict(row)
    out["deal_id"] = out["id"]
    return out


# --------------------------------------------------------------------------- #
# Legacy import (one-shot)
# --------------------------------------------------------------------------- #
def maybe_import_legacy(conn: sqlite3.Connection, workspace_root: Path) -> None:
    """Importa o records.json legado uma única vez. Marca via counter
    `_legacy_imported` pra não repetir."""
    done = conn.execute(
        "SELECT value FROM counters WHERE key='_legacy_imported' AND period='all'"
    ).fetchone()
    if done:
        return
    legacy = workspace_root / "memory" / "jotaduo" / "crm" / "records.json"
    ts = now_iso()
    if legacy.exists():
        try:
            data = json.loads(legacy.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            data = {}
        for cid, rec in (data.get("contacts") or {}).items():
            extra = {
                k: v
                for k, v in rec.items()
                if k not in CONTACT_COLUMNS and k not in {"contact_id"}
            }
            conn.execute(
                """INSERT OR IGNORE INTO contacts
                   (id,name,email,phone,company,source,status,tags,extra_json,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    cid,
                    clean_text(rec.get("name", "")),
                    clean_text(rec.get("email", "")),
                    clean_text(rec.get("phone", "")),
                    clean_text(rec.get("company", "")),
                    clean_text(rec.get("source", "import")) or "import",
                    rec.get("status") if rec.get("status") in VALID_CONTACT_STATUS else "lead",
                    clean_text(rec.get("tags", "")),
                    json.dumps(extra, ensure_ascii=False),
                    ts,
                    ts,
                ),
            )
        for did, rec in (data.get("deals") or {}).items():
            conn.execute(
                """INSERT OR IGNORE INTO deals
                   (id,contact_id,title,stage,value_cents,currency,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    did,
                    rec.get("contact_id", ""),
                    clean_text(rec.get("title", "")),
                    rec.get("stage") if rec.get("stage") in VALID_DEAL_STAGES else "new",
                    int(rec.get("value_cents", 0) or 0),
                    rec.get("currency", "BRL") or "BRL",
                    ts,
                    ts,
                ),
            )
        for note in data.get("notes") or []:
            conn.execute(
                "INSERT INTO activities (contact_id,deal_id,type,body,actor,created_at) VALUES (?,?,?,?,?,?)",
                (
                    note.get("contact_id"),
                    None,
                    "note",
                    clean_text(note.get("note", ""), TEXT_MAX_LEN, keep_newlines=True),
                    "legacy",
                    note.get("created_at") or ts,
                ),
            )
    conn.execute(
        "INSERT OR REPLACE INTO counters (key,period,value,updated_at) VALUES ('_legacy_imported','all',1,?)",
        (ts,),
    )
    conn.commit()


# --------------------------------------------------------------------------- #
# Actions
# --------------------------------------------------------------------------- #
def act_upsert_contact(conn, p) -> dict:
    identifier = p.get("contact_id") or p.get("email") or p.get("idempotency_key")
    if not identifier:
        raise ValueError("contact_id, email or idempotency_key required")
    cid = p.get("contact_id") or stable_id("contact", str(identifier).lower())
    ts = now_iso()
    existing = conn.execute("SELECT * FROM contacts WHERE id=?", (cid,)).fetchone()

    status = p.get("status")
    if status and status not in VALID_CONTACT_STATUS:
        raise ValueError("invalid status: " + status + " (use: " + ", ".join(sorted(VALID_CONTACT_STATUS)) + ")")

    # Campos livres (qualquer coisa fora das colunas/controle) viram extra_json.
    reserved = CONTACT_COLUMNS | {"action", "workspace_root", "contact_id", "idempotency_key"}
    incoming_extra = {k: v for k, v in p.items() if k not in reserved}

    if existing:
        cur = row_to_contact(existing)
        merged_extra = {**cur["extra"], **incoming_extra}
        conn.execute(
            """UPDATE contacts SET name=?,email=?,phone=?,company=?,source=?,status=?,tags=?,extra_json=?,updated_at=?
               WHERE id=?""",
            (
                clean_text(p.get("name", cur["name"])),
                clean_text(p.get("email", cur["email"])),
                clean_text(p.get("phone", cur["phone"])),
                clean_text(p.get("company", cur["company"])),
                clean_text(p.get("source", cur["source"])) or "manual",
                status or cur["status"],
                clean_text(p.get("tags", cur["tags"])),
                json.dumps(merged_extra, ensure_ascii=False),
                ts,
                cid,
            ),
        )
    else:
        conn.execute(
            """INSERT INTO contacts
               (id,name,email,phone,company,source,status,tags,extra_json,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                cid,
                clean_text(p.get("name", "")),
                clean_text(p.get("email", "")),
                clean_text(p.get("phone", "")),
                clean_text(p.get("company", "")),
                clean_text(p.get("source", "manual")) or "manual",
                status or "lead",
                clean_text(p.get("tags", "")),
                json.dumps(incoming_extra, ensure_ascii=False),
                ts,
                ts,
            ),
        )
    conn.commit()
    return row_to_contact(conn.execute("SELECT * FROM contacts WHERE id=?", (cid,)).fetchone())


def act_get_contact(conn, p) -> dict:
    require(p, ["contact_id"])
    row = conn.execute("SELECT * FROM contacts WHERE id=?", (p["contact_id"],)).fetchone()
    if not row:
        return {"contact_id": p["contact_id"], "status": "not_found"}
    out = row_to_contact(row)
    out["deals"] = [
        row_to_deal(r)
        for r in conn.execute(
            "SELECT * FROM deals WHERE contact_id=? ORDER BY created_at DESC", (p["contact_id"],)
        ).fetchall()
    ]
    return out


def act_list_contacts(conn, p) -> dict:
    where, args = [], []
    if p.get("status"):
        where.append("status=?")
        args.append(p["status"])
    if p.get("source"):
        where.append("source=?")
        args.append(p["source"])
    if p.get("search"):
        term = "%" + str(p["search"]).lower() + "%"
        where.append("(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(company) LIKE ? OR phone LIKE ?)")
        args += [term, term, term, "%" + str(p["search"]) + "%"]
    limit = max(1, min(int(p.get("limit", 50) or 50), 500))
    sql = "SELECT * FROM contacts"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY updated_at DESC LIMIT ?"
    args.append(limit)
    rows = [row_to_contact(r) for r in conn.execute(sql, args).fetchall()]
    return {"contacts": rows, "count": len(rows)}


def act_create_deal(conn, p) -> dict:
    require(p, ["idempotency_key", "contact_id", "title"])
    if not conn.execute("SELECT 1 FROM contacts WHERE id=?", (p["contact_id"],)).fetchone():
        raise ValueError("contact not found: " + p["contact_id"])
    stage = p.get("stage", "new")
    if stage not in VALID_DEAL_STAGES:
        raise ValueError("invalid stage: " + stage + " (use: " + ", ".join(sorted(VALID_DEAL_STAGES)) + ")")
    did = stable_id("deal", str(p["idempotency_key"]))
    ts = now_iso()
    closed = ts if stage in {"won", "lost"} else None
    conn.execute(
        """INSERT OR IGNORE INTO deals
           (id,contact_id,title,stage,value_cents,currency,created_at,updated_at,closed_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            did,
            p["contact_id"],
            clean_text(p["title"]),
            stage,
            int(p.get("value_cents", 0) or 0),
            (p.get("currency") or "BRL"),
            ts,
            ts,
            closed,
        ),
    )
    conn.commit()
    return row_to_deal(conn.execute("SELECT * FROM deals WHERE id=?", (did,)).fetchone())


def act_move_stage(conn, p) -> dict:
    require(p, ["deal_id", "stage"])
    if p["stage"] not in VALID_DEAL_STAGES:
        raise ValueError("invalid stage: " + p["stage"] + " (use: " + ", ".join(sorted(VALID_DEAL_STAGES)) + ")")
    row = conn.execute("SELECT * FROM deals WHERE id=?", (p["deal_id"],)).fetchone()
    if not row:
        raise ValueError("deal not found")
    ts = now_iso()
    closed = ts if p["stage"] in {"won", "lost"} else None
    conn.execute(
        "UPDATE deals SET stage=?, updated_at=?, closed_at=? WHERE id=?",
        (p["stage"], ts, closed, p["deal_id"]),
    )
    conn.execute(
        "INSERT INTO activities (contact_id,deal_id,type,body,actor,created_at) VALUES (?,?,?,?,?,?)",
        (row["contact_id"], p["deal_id"], "stage_change",
         row["stage"] + " -> " + p["stage"], clean_text(p.get("actor", "")), ts),
    )
    conn.commit()
    return row_to_deal(conn.execute("SELECT * FROM deals WHERE id=?", (p["deal_id"],)).fetchone())


def act_get_deal(conn, p) -> dict:
    require(p, ["deal_id"])
    row = conn.execute("SELECT * FROM deals WHERE id=?", (p["deal_id"],)).fetchone()
    if not row:
        return {"deal_id": p["deal_id"], "status": "not_found"}
    return row_to_deal(row)


def act_list_deals(conn, p) -> dict:
    where, args = [], []
    if p.get("stage"):
        where.append("stage=?")
        args.append(p["stage"])
    if p.get("contact_id"):
        where.append("contact_id=?")
        args.append(p["contact_id"])
    limit = max(1, min(int(p.get("limit", 50) or 50), 500))
    sql = "SELECT * FROM deals"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY updated_at DESC LIMIT ?"
    args.append(limit)
    rows = [row_to_deal(r) for r in conn.execute(sql, args).fetchall()]
    return {"deals": rows, "count": len(rows)}


def act_add_activity(conn, p) -> dict:
    # Compat: add_note exige contact_id+note. add_activity é mais flexível.
    body = p.get("body", p.get("note", ""))
    if not body and p.get("type") not in VALID_ACTIVITY_TYPES:
        require(p, ["body"])
    atype = p.get("type", "note")
    if atype not in VALID_ACTIVITY_TYPES:
        raise ValueError("invalid type: " + atype + " (use: " + ", ".join(sorted(VALID_ACTIVITY_TYPES)) + ")")
    if not p.get("contact_id") and not p.get("deal_id"):
        raise ValueError("contact_id or deal_id required")
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO activities (contact_id,deal_id,type,body,actor,created_at) VALUES (?,?,?,?,?,?)",
        (
            p.get("contact_id"),
            p.get("deal_id"),
            atype,
            clean_text(body, TEXT_MAX_LEN, keep_newlines=True),
            clean_text(p.get("actor", "")),
            ts,
        ),
    )
    conn.commit()
    return {
        "id": cur.lastrowid,
        "contact_id": p.get("contact_id"),
        "deal_id": p.get("deal_id"),
        "type": atype,
        "created_at": ts,
    }


def act_list_activities(conn, p) -> dict:
    where, args = [], []
    if p.get("contact_id"):
        where.append("contact_id=?")
        args.append(p["contact_id"])
    if p.get("deal_id"):
        where.append("deal_id=?")
        args.append(p["deal_id"])
    if p.get("type"):
        where.append("type=?")
        args.append(p["type"])
    limit = max(1, min(int(p.get("limit", 50) or 50), 500))
    sql = "SELECT * FROM activities"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC, id DESC LIMIT ?"
    args.append(limit)
    rows = [dict(r) for r in conn.execute(sql, args).fetchall()]
    return {"activities": rows, "count": len(rows)}


def act_bump_metric(conn, p) -> dict:
    require(p, ["key"])
    key = clean_text(p["key"], 80)
    period = clean_text(p.get("period", current_period()), 20) or current_period()
    by = int(p.get("by", 1) or 1)
    ts = now_iso()
    conn.execute(
        """INSERT INTO counters (key,period,value,updated_at) VALUES (?,?,?,?)
           ON CONFLICT(key,period) DO UPDATE SET value=value+excluded.value, updated_at=excluded.updated_at""",
        (key, period, by, ts),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM counters WHERE key=? AND period=?", (key, period)).fetchone()
    return dict(row)


def act_metrics(conn, p) -> dict:
    period = p.get("period")  # opcional; filtra counters por período

    contacts_by_status = {
        r["status"]: r["n"]
        for r in conn.execute("SELECT status, COUNT(*) n FROM contacts GROUP BY status").fetchall()
    }
    deals_by_stage = {
        r["stage"]: r["n"]
        for r in conn.execute("SELECT stage, COUNT(*) n FROM deals GROUP BY stage").fetchall()
    }
    won = conn.execute(
        "SELECT COALESCE(SUM(value_cents),0) v, COUNT(*) n FROM deals WHERE stage='won'"
    ).fetchone()
    open_pipeline = conn.execute(
        "SELECT COALESCE(SUM(value_cents),0) v, COUNT(*) n FROM deals WHERE stage NOT IN ('won','lost')"
    ).fetchone()

    csql = "SELECT key,period,value FROM counters WHERE key NOT LIKE '\\_%' ESCAPE '\\'"
    cargs = []
    if period:
        csql += " AND period=?"
        cargs.append(period)
    counters = [dict(r) for r in conn.execute(csql + " ORDER BY key, period", cargs).fetchall()]

    return {
        "totals": {
            "contacts": sum(contacts_by_status.values()),
            "deals": sum(deals_by_stage.values()),
            "activities": conn.execute("SELECT COUNT(*) n FROM activities").fetchone()["n"],
        },
        "contacts_by_status": contacts_by_status,
        "deals_by_stage": deals_by_stage,
        "won": {"count": won["n"], "value_cents": won["v"]},
        "open_pipeline": {"count": open_pipeline["n"], "value_cents": open_pipeline["v"]},
        "counters": counters,
    }


ACTIONS = {
    "upsert_contact": act_upsert_contact,
    "get_contact": act_get_contact,
    "list_contacts": act_list_contacts,
    "create_deal": act_create_deal,
    "move_stage": act_move_stage,
    "get_deal": act_get_deal,
    "list_deals": act_list_deals,
    "add_note": act_add_activity,
    "add_activity": act_add_activity,
    "list_activities": act_list_activities,
    "bump_metric": act_bump_metric,
    "metrics": act_metrics,
}


def crm_action(workspace_root: Path, payload: dict) -> dict:
    action = payload.get("action")
    fn = ACTIONS.get(action)
    if not fn:
        raise ValueError("invalid action: " + str(action) + " (valid: " + ", ".join(sorted(ACTIONS)) + ")")
    conn = connect(workspace_root)
    try:
        return fn(conn, payload)
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="CRM local por tenant (SQLite). Lê uma ação JSON do stdin, "
        "escreve um objeto JSON no stdout. Ações: " + ", ".join(sorted(ACTIONS)) + "."
    )
    parser.parse_args()
    try:
        data = read_json_stdin()
        reject_sensitive_keys(data)
        write_json_stdout(crm_action(find_workspace_root(data.get("workspace_root")), data))
        return 0
    except Exception as exc:
        write_json_stdout({"error": str(exc)})
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
