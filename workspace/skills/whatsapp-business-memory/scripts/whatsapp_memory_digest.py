#!/usr/bin/env python3
"""Create a privacy-safe digest from the PicoClaw WhatsApp native inbox DB."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any


DEFAULT_DB = Path("workspace/whatsapp/conversations.db")

SENSITIVE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b"), "[cpf]"),
    (re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b"), "[cnpj]"),
    (re.compile(r"\b(?:\d[ -]*?){13,19}\b"), "[card-or-long-number]"),
    (
        re.compile(r"(?<!\d)(?:\+?55\s*)?\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}(?!\d)"),
        "[phone]",
    ),
    (re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b"), "[email]"),
    (
        re.compile(r"\b(?:senha|password|token|api[_ -]?key|chave)\s*[:=]\s*\S+", re.I),
        "[secret]",
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read PicoClaw WhatsApp inbox messages and emit a sanitized digest."
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to conversations.db")
    parser.add_argument("--since-days", type=int, default=30, help="Window in days")
    parser.add_argument("--limit-chats", type=int, default=50, help="Maximum chats to include")
    parser.add_argument(
        "--messages-per-chat",
        type=int,
        default=80,
        help="Maximum recent messages per chat",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="Output format",
    )
    parser.add_argument(
        "--max-message-chars",
        type=int,
        default=500,
        help="Maximum characters per sanitized message",
    )
    return parser.parse_args()


def connect_readonly(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise FileNotFoundError(f"WhatsApp inbox DB not found: {path}")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def has_tables(conn: sqlite3.Connection, names: set[str]) -> bool:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    present = {row["name"] for row in rows}
    return names.issubset(present)


def mask_jid(jid: str) -> str:
    if not jid:
        return ""
    account, _, domain = jid.partition("@")
    digits = re.sub(r"\D", "", account)
    if len(digits) >= 6:
        return f"{digits[:4]}...{digits[-2:]}@{domain or 'jid'}"
    if len(account) > 4:
        return f"{account[:2]}...{account[-1:]}@{domain or 'jid'}"
    return "[jid]"


def sanitize_text(text: str, max_chars: int) -> str:
    clean = " ".join((text or "").replace("\x00", " ").split())
    for pattern, replacement in SENSITIVE_PATTERNS:
        clean = pattern.sub(replacement, clean)
    if len(clean) > max_chars:
        clean = clean[: max_chars - 1].rstrip() + "..."
    return clean


def sanitize_value(value: Any, max_chars: int = 300) -> Any:
    if isinstance(value, str):
        return sanitize_text(value, max_chars)
    if isinstance(value, list):
        return [sanitize_value(item, max_chars) for item in value]
    if isinstance(value, dict):
        return {str(key): sanitize_value(item, max_chars) for key, item in value.items()}
    return value


def ms_to_iso(value: int) -> str:
    if not value:
        return ""
    return dt.datetime.fromtimestamp(value / 1000, tz=dt.timezone.utc).isoformat(timespec="minutes")


def load_json_field(value: str, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def fetch_profile(conn: sqlite3.Connection, jid: str) -> dict[str, Any]:
    try:
        row = conn.execute(
            """
            SELECT name, city, company, interest, preferences, summary, lead_stage,
                   lead_score, priority, intent, consent_status, tags_json,
                   assigned_to, next_action, follow_up_at, follow_up_reason, updated_at
            FROM wa_contact_profiles
            WHERE chat_jid = ?
            """,
            (jid,),
        ).fetchone()
    except sqlite3.OperationalError:
        return {}
    if row is None:
        return {}
    out = dict(row)
    out["tags"] = load_json_field(out.pop("tags_json", "[]"), [])
    return sanitize_value(out)


def fetch_insight(conn: sqlite3.Connection, jid: str) -> dict[str, Any]:
    try:
        row = conn.execute(
            """
            SELECT intent, priority, lead_stage, needs_handoff, unanswered,
                   target_sector, summary, next_action, collected_fields_json,
                   missing_fields_json, products_json, last_message_ts, updated_at
            FROM wa_conversation_insights
            WHERE chat_jid = ?
            """,
            (jid,),
        ).fetchone()
    except sqlite3.OperationalError:
        return {}
    if row is None:
        return {}
    out = dict(row)
    out["needs_handoff"] = bool(out.get("needs_handoff"))
    out["unanswered"] = bool(out.get("unanswered"))
    out["collected_fields"] = load_json_field(out.pop("collected_fields_json", "{}"), {})
    out["missing_fields"] = load_json_field(out.pop("missing_fields_json", "[]"), [])
    out["products"] = load_json_field(out.pop("products_json", "[]"), [])
    return sanitize_value(out)


def build_digest(args: argparse.Namespace) -> dict[str, Any]:
    db_path = Path(args.db)
    since_ms = int(
        (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.since_days)).timestamp() * 1000
    )
    with connect_readonly(db_path) as conn:
        required = {"wa_chats", "wa_messages"}
        if not has_tables(conn, required):
            raise RuntimeError(f"DB does not contain required tables: {', '.join(sorted(required))}")

        chats = conn.execute(
            """
            SELECT jid, push_name, display_name, last_message_ts, last_preview,
                   last_direction, unread_count, paused, updated_at
            FROM wa_chats
            WHERE last_message_ts >= ?
            ORDER BY last_message_ts DESC, updated_at DESC
            LIMIT ?
            """,
            (since_ms, max(1, args.limit_chats)),
        ).fetchall()

        chat_items: list[dict[str, Any]] = []
        total_messages = 0
        inbound = 0
        outbound = 0
        source_counts: dict[str, int] = {}

        for chat in chats:
            jid = chat["jid"]
            msg_rows = conn.execute(
                """
                SELECT id, direction, source, content, ts, sender_jid
                FROM (
                    SELECT id, direction, source, content, ts, sender_jid
                    FROM wa_messages
                    WHERE chat_jid = ? AND ts >= ?
                    ORDER BY ts DESC, id DESC
                    LIMIT ?
                )
                ORDER BY ts ASC, id ASC
                """,
                (jid, since_ms, max(1, args.messages_per_chat)),
            ).fetchall()

            messages: list[dict[str, Any]] = []
            for msg in msg_rows:
                total_messages += 1
                direction = msg["direction"] or ""
                source = msg["source"] or ""
                if direction == "in":
                    inbound += 1
                elif direction == "out":
                    outbound += 1
                source_counts[source] = source_counts.get(source, 0) + 1
                messages.append(
                    {
                        "ts": ms_to_iso(int(msg["ts"] or 0)),
                        "direction": direction,
                        "source": source,
                        "sender": mask_jid(msg["sender_jid"] or ""),
                        "content": sanitize_text(msg["content"] or "", args.max_message_chars),
                    }
                )

            chat_items.append(
                {
                    "jid": mask_jid(jid),
                    "display_name": sanitize_text(chat["display_name"] or chat["push_name"] or "", 120),
                    "last_message_ts": ms_to_iso(int(chat["last_message_ts"] or 0)),
                    "last_direction": chat["last_direction"] or "",
                    "unread_count": int(chat["unread_count"] or 0),
                    "paused": bool(chat["paused"]),
                    "profile": fetch_profile(conn, jid),
                    "insight": fetch_insight(conn, jid),
                    "messages": messages,
                }
            )

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source_db": str(db_path),
        "since_days": args.since_days,
        "chats": len(chat_items),
        "messages": total_messages,
        "inbound_messages": inbound,
        "outbound_messages": outbound,
        "source_counts": source_counts,
        "items": chat_items,
    }


def compact_dict(values: dict[str, Any], keys: list[str]) -> str:
    parts: list[str] = []
    for key in keys:
        value = values.get(key)
        if value in ("", None, [], {}, 0):
            continue
        parts.append(f"{key}={value}")
    return "; ".join(parts)


def render_markdown(digest: dict[str, Any]) -> str:
    lines = [
        "# WhatsApp Memory Digest",
        "",
        f"- Generated at: {digest['generated_at']}",
        f"- Source DB: `{digest['source_db']}`",
        f"- Window: last {digest['since_days']} days",
        f"- Chats: {digest['chats']}",
        f"- Messages: {digest['messages']}",
        f"- Inbound: {digest['inbound_messages']}",
        f"- Outbound: {digest['outbound_messages']}",
        "",
        "Use this digest only as analysis input. Do not save raw messages as memory.",
        "",
    ]
    for idx, item in enumerate(digest["items"], start=1):
        title = item["display_name"] or item["jid"]
        lines.extend(
            [
                f"## Chat {idx}: {title}",
                "",
                f"- JID: {item['jid']}",
                f"- Last message: {item['last_message_ts']}",
                f"- Last direction: {item['last_direction']}",
                f"- Unread: {item['unread_count']}",
                f"- Paused: {item['paused']}",
            ]
        )
        profile = compact_dict(
            item["profile"],
            [
                "name",
                "city",
                "company",
                "interest",
                "summary",
                "lead_stage",
                "lead_score",
                "priority",
                "intent",
                "consent_status",
                "tags",
                "next_action",
                "follow_up_reason",
            ],
        )
        insight = compact_dict(
            item["insight"],
            [
                "intent",
                "priority",
                "lead_stage",
                "needs_handoff",
                "unanswered",
                "target_sector",
                "summary",
                "next_action",
                "missing_fields",
                "products",
            ],
        )
        if profile:
            lines.append(f"- Profile: {profile}")
        if insight:
            lines.append(f"- Insight: {insight}")
        lines.extend(["", "### Messages", ""])
        if not item["messages"]:
            lines.append("- No messages in selected window.")
        for msg in item["messages"]:
            sender = f" sender={msg['sender']}" if msg["sender"] else ""
            lines.append(
                f"- {msg['ts']} | {msg['direction']}/{msg['source']}{sender}: {msg['content']}"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    try:
        digest = build_digest(args)
    except Exception as exc:  # noqa: BLE001 - CLI should return a clear one-line failure.
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(json.dumps(digest, ensure_ascii=False, indent=2))
    else:
        print(render_markdown(digest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
