#!/usr/bin/env python3
# verificar-respostas-jotaduo / check-inbox.py
#
# Reads workspace/state/jotaduo-wa-inbox.jsonl produced by the launcher's
# /api/launcher/jotaduo-wa-inbound handler (see web/backend/api/jotaduo_wa_
# inbound.go). Keeps a byte-offset pointer so successive calls only return
# messages that arrived since the last --consume.
#
# Pointer file: workspace/state/jotaduo-wa-inbox.pointer
#   Plain integer (the byte offset of the next message to emit). Missing
#   pointer = start from byte 0. We use a byte offset rather than a line
#   counter so an external editor that deletes lines doesn't desync.
#
# Exit codes:
#   0 — success (with or without new messages)
#   1 — I/O error or malformed JSONL
#   2 — PICOCLAW_HOME missing

import argparse
import io
import json
import os
import sys
from pathlib import Path

INBOX_REL = "workspace/state/jotaduo-wa-inbox.jsonl"
POINTER_REL = "workspace/state/jotaduo-wa-inbox.pointer"


def resolve_home() -> Path:
    home = os.environ.get("PICOCLAW_HOME", "").strip()
    if not home:
        print("check-inbox: PICOCLAW_HOME env var not set", file=sys.stderr)
        sys.exit(2)
    return Path(home)


def read_pointer(pointer_path: Path) -> int:
    if not pointer_path.is_file():
        return 0
    try:
        raw = pointer_path.read_text(encoding="utf-8").strip()
        if not raw:
            return 0
        return max(0, int(raw))
    except (OSError, ValueError) as exc:
        # Corrupt pointer — treat as fresh start. Log to stderr so it's
        # auditable but don't fail; the agent will just re-process older
        # messages, which is annoying but safer than dropping them.
        print(f"check-inbox: pointer corrupt ({exc}); restarting from 0", file=sys.stderr)
        return 0


def write_pointer(pointer_path: Path, offset: int) -> None:
    pointer_path.parent.mkdir(parents=True, exist_ok=True)
    # Write to a temp file + rename for atomicity. A torn write would leave
    # the pointer corrupt, forcing the next run to re-emit messages — not
    # a data-loss bug but enough latency penalty to justify the rename.
    tmp = pointer_path.with_suffix(pointer_path.suffix + ".tmp")
    tmp.write_text(str(offset), encoding="utf-8")
    tmp.replace(pointer_path)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Emit new jotaduo-wa inbox messages as JSONL.",
        add_help=True,
    )
    p.add_argument(
        "--consume",
        action="store_true",
        help="advance the read pointer past the messages emitted in this run",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="emit at most N messages (default: no limit)",
    )
    p.add_argument(
        "--since-id",
        default="",
        help="emit only messages AFTER one with this message_id, ignoring the pointer",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    home = resolve_home()
    inbox_path = home / INBOX_REL
    pointer_path = home / POINTER_REL

    if not inbox_path.is_file():
        # No messages have ever arrived (or the tenant isn't public).
        # Empty stdout, normal exit — the agent treats this as "nothing
        # new", same as a real empty inbox.
        return 0

    try:
        size = inbox_path.stat().st_size
    except OSError as exc:
        print(f"check-inbox: stat inbox failed: {exc}", file=sys.stderr)
        return 1

    start = read_pointer(pointer_path) if not args.since_id else 0
    if start >= size:
        # Pointer is at EOF — nothing new since last consume. Common case
        # for repeated polls.
        return 0
    if start > size:
        # File shrank (manual edit or rotation). Reset to 0 so we don't
        # skip everything silently.
        print(f"check-inbox: pointer ({start}) > file size ({size}); restarting from 0", file=sys.stderr)
        start = 0

    try:
        with inbox_path.open("rb") as f:
            f.seek(start)
            tail = f.read()
    except OSError as exc:
        print(f"check-inbox: read inbox failed: {exc}", file=sys.stderr)
        return 1

    emitted = 0
    seen_since_id = args.since_id == ""  # if no --since-id, emit everything

    # `processed` is the byte count consumed from `tail` so far. The new
    # pointer = start + processed. We bump it AFTER successfully handling
    # each line so a partial-line crash leaves the pointer pre-crash.
    processed = 0

    # readline() returns each line WITH its trailing \n (when present), so
    # len() gives the exact byte cost. The final iteration returns b"" at
    # EOF — split-then-count is error-prone for files that may or may not
    # end with a newline, so we use the iterator instead.
    buf = io.BytesIO(tail)
    while True:
        raw = buf.readline()
        if not raw:
            break
        line_bytes = len(raw)
        stripped = raw.rstrip(b"\r\n")
        if not stripped:
            processed += line_bytes
            continue

        try:
            msg = json.loads(stripped)
        except json.JSONDecodeError as exc:
            print(f"check-inbox: skipping malformed line: {exc}", file=sys.stderr)
            processed += line_bytes
            continue

        if not seen_since_id:
            # Marker hunt — once we hit --since-id's message, the NEXT
            # message starts emitting (per the documented --since-id
            # contract).
            if msg.get("message_id") == args.since_id:
                seen_since_id = True
            processed += line_bytes
            continue

        sys.stdout.write(stripped.decode("utf-8", errors="replace") + "\n")
        emitted += 1
        processed += line_bytes

        if args.limit > 0 and emitted >= args.limit:
            break

    sys.stdout.flush()

    if args.consume:
        # If --limit cut us off mid-tail, advance the pointer only to what
        # we actually emitted — the unread portion stays unread.
        try:
            write_pointer(pointer_path, start + processed)
        except OSError as exc:
            print(f"check-inbox: write pointer failed: {exc}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
