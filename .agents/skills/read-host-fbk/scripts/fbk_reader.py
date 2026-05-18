#!/usr/bin/env python3
"""Restore and query Firebird .fbk backups with gbak and isql."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


DEFAULT_WORKDIR = Path("workspace/host-fbk-reader")
DEFAULT_USER = "SYSDBA"
DEFAULT_PASSWORD = "masterkey"


def find_command(names: list[str]) -> str | None:
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return None


def require_command(names: list[str], purpose: str) -> str:
    found = find_command(names)
    if found:
        return found
    joined = ", ".join(names)
    raise SystemExit(f"Missing {purpose}: expected one of {joined} in PATH")


def decode_output(data: bytes) -> str:
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def run(cmd: list[str], *, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        cmd,
        input=input_text.encode("utf-8") if input_text is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return subprocess.CompletedProcess(
        result.args,
        result.returncode,
        decode_output(result.stdout or b""),
        result.stderr,
    )


def ensure_fbk(path: Path) -> Path:
    path = path.expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Backup not found: {path}")
    if not path.is_file():
        raise SystemExit(f"Backup is not a file: {path}")
    return path


def output_fdb_path(fbk: Path, workdir: Path) -> Path:
    safe_stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", fbk.stem).strip("._") or "database"
    return workdir.expanduser().resolve() / f"{safe_stem}.fdb"


def restore_backup(args: argparse.Namespace) -> Path:
    fbk = ensure_fbk(Path(args.fbk))
    workdir = Path(args.workdir)
    fdb = Path(args.out).expanduser().resolve() if args.out else output_fdb_path(fbk, workdir)
    fdb.parent.mkdir(parents=True, exist_ok=True)

    if fdb.exists() and not args.force:
        if fdb.stat().st_mtime >= fbk.stat().st_mtime:
            print(f"Using existing restored database: {fdb}")
            return fdb
        raise SystemExit(f"Restored database is older than backup. Rerun with --force: {fdb}")

    if fdb.exists() and args.force:
        fdb.unlink()

    gbak = require_command(["gbak"], "Firebird backup tool")
    cmd = [gbak, "-c"]
    if args.verbose_restore:
        cmd.append("-v")
    cmd.extend(
        [
            "-user",
            args.user,
            "-password",
            args.password,
            str(fbk),
            str(fdb),
        ]
    )
    print("Restoring backup with gbak...")
    result = run(cmd)
    if result.returncode != 0:
        print(result.stdout.rstrip())
        raise SystemExit(result.returncode)
    if args.verbose_restore and result.stdout.strip():
        print(result.stdout.rstrip())
    print(f"Restored database: {fdb}")
    return fdb


def is_read_only_sql(sql: str) -> bool:
    cleaned = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    cleaned = re.sub(r"(?m)--.*$", " ", cleaned).strip().lstrip("(").lower()
    return cleaned.startswith("select") or cleaned.startswith("with")


def ensure_semicolon(sql: str) -> str:
    stripped = sql.strip()
    if not stripped.endswith(";"):
        stripped += ";"
    return stripped


def run_isql(args: argparse.Namespace, sql: str) -> int:
    if not args.allow_nonselect and not is_read_only_sql(sql):
        raise SystemExit("Refusing non-read-only SQL. Pass --allow-nonselect for disposable restored copies.")

    fdb = restore_backup(args)
    isql = require_command(["isql-fb", "isql"], "Firebird SQL shell")
    script = "\n".join(
        [
            "SET SQL DIALECT 3;",
            "SET HEADING ON;",
            "SET LIST OFF;" if not args.list else "SET LIST ON;",
            ensure_semicolon(sql),
            "QUIT;",
            "",
        ]
    )
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as handle:
        handle.write(script)
        script_path = handle.name
    try:
        cmd = [
            isql,
            "-q",
            "-bail",
            "-pagelength",
            "0",
            "-user",
            args.user,
            "-password",
            args.password,
            "-i",
            script_path,
            str(fdb),
        ]
        result = run(cmd)
        if args.output:
            output_path = Path(args.output).expanduser().resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(result.stdout, encoding="utf-8")
            print(f"Wrote query output: {output_path}")
        else:
            print(result.stdout.rstrip())
        return result.returncode
    finally:
        try:
            os.unlink(script_path)
        except FileNotFoundError:
            pass


def quote_identifier(name: str) -> str:
    bare = name.strip()
    if bare.startswith('"') and bare.endswith('"') and len(bare) >= 2:
        bare = bare[1:-1]
    return '"' + bare.replace('"', '""') + '"'


def metadata_table_name(name: str) -> str:
    bare = name.strip()
    if bare.startswith('"') and bare.endswith('"') and len(bare) >= 2:
        return bare[1:-1].replace("'", "''")
    return bare.upper().replace("'", "''")


def command_tools(_: argparse.Namespace) -> int:
    rows = [
        ("gbak", find_command(["gbak"])),
        ("isql-fb/isql", find_command(["isql-fb", "isql"])),
        ("docker", find_command(["docker"])),
    ]
    for label, found in rows:
        print(f"{label}: {found or 'not found'}")
    return 0


def command_peek(args: argparse.Namespace) -> int:
    fbk = ensure_fbk(Path(args.fbk))
    strings_cmd = require_command(["strings"], "strings utility")
    limit = max(1, args.limit)
    result = run([strings_cmd, "-a", "-n", "4", str(fbk)])
    if result.returncode != 0:
        print(result.stdout.rstrip())
        return result.returncode
    lines = result.stdout.splitlines()[:limit]
    for line in lines:
        print(line)
    return 0


def command_restore(args: argparse.Namespace) -> int:
    restore_backup(args)
    return 0


def command_tables(args: argparse.Namespace) -> int:
    view_filter = "" if args.include_views else "AND RDB$VIEW_BLR IS NULL"
    sql = f"""
SELECT
  TRIM(RDB$RELATION_NAME) AS TABLE_NAME
FROM RDB$RELATIONS
WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
  {view_filter}
ORDER BY RDB$RELATION_NAME
"""
    return run_isql(args, sql)


def command_schema(args: argparse.Namespace) -> int:
    table_name = metadata_table_name(args.table)
    sql = f"""
SELECT
  TRIM(r.RDB$FIELD_NAME) AS FIELD_NAME,
  CASE f.RDB$FIELD_TYPE
    WHEN 7 THEN 'SMALLINT'
    WHEN 8 THEN 'INTEGER'
    WHEN 10 THEN 'FLOAT'
    WHEN 12 THEN 'DATE'
    WHEN 13 THEN 'TIME'
    WHEN 14 THEN 'CHAR'
    WHEN 16 THEN CASE f.RDB$FIELD_SUB_TYPE
      WHEN 0 THEN 'BIGINT'
      WHEN 1 THEN 'NUMERIC'
      WHEN 2 THEN 'DECIMAL'
      ELSE 'INT64'
    END
    WHEN 27 THEN 'DOUBLE'
    WHEN 35 THEN 'TIMESTAMP'
    WHEN 37 THEN 'VARCHAR'
    WHEN 261 THEN 'BLOB'
    ELSE 'TYPE_' || CAST(f.RDB$FIELD_TYPE AS VARCHAR(20))
  END AS FIELD_TYPE,
  f.RDB$FIELD_LENGTH AS FIELD_LENGTH,
  f.RDB$FIELD_SCALE AS FIELD_SCALE,
  r.RDB$FIELD_POSITION AS FIELD_POSITION,
  COALESCE(r.RDB$NULL_FLAG, 0) AS NOT_NULL
FROM RDB$RELATION_FIELDS r
JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = r.RDB$FIELD_SOURCE
WHERE TRIM(r.RDB$RELATION_NAME) = '{table_name}'
ORDER BY r.RDB$FIELD_POSITION
"""
    return run_isql(args, sql)


def command_sample(args: argparse.Namespace) -> int:
    limit = max(1, args.limit)
    sql = f"SELECT FIRST {limit} * FROM {quote_identifier(args.table)}"
    return run_isql(args, sql)


def command_query(args: argparse.Namespace) -> int:
    sql = args.sql
    if args.sql_file:
        sql = Path(args.sql_file).read_text(encoding="utf-8")
    if not sql:
        raise SystemExit("Provide SQL text or --sql-file")
    return run_isql(args, sql)


def add_common_restore_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("fbk", help="Path to the .fbk backup")
    parser.add_argument("--workdir", default=str(DEFAULT_WORKDIR), help="Directory for restored .fdb files")
    parser.add_argument("--out", help="Explicit restored .fdb output path")
    parser.add_argument("--force", action="store_true", help="Overwrite the restored .fdb")
    parser.add_argument("--verbose-restore", action="store_true", help="Show full gbak restore log")
    parser.add_argument("--user", default=DEFAULT_USER, help="Firebird user")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Firebird password")


def add_query_options(parser: argparse.ArgumentParser) -> None:
    add_common_restore_options(parser)
    parser.add_argument("--list", action="store_true", help="Use isql SET LIST ON output")
    parser.add_argument("--output", help="Write isql output to a text file")
    parser.add_argument("--allow-nonselect", action="store_true", help="Allow non-read-only SQL")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    tools = sub.add_parser("tools", help="Show required command availability")
    tools.set_defaults(func=command_tools)

    peek = sub.add_parser("peek", help="Show first strings from the backup without restoring")
    peek.add_argument("fbk", help="Path to the .fbk backup")
    peek.add_argument("--limit", type=int, default=40, help="Number of strings to print")
    peek.set_defaults(func=command_peek)

    restore = sub.add_parser("restore", help="Restore backup to an .fdb")
    add_common_restore_options(restore)
    restore.set_defaults(func=command_restore)

    tables = sub.add_parser("tables", help="List user tables")
    add_query_options(tables)
    tables.add_argument("--include-views", action="store_true", help="Include views")
    tables.set_defaults(func=command_tables)

    schema = sub.add_parser("schema", help="Show columns for a table")
    add_query_options(schema)
    schema.add_argument("--table", required=True, help="Table name")
    schema.set_defaults(func=command_schema)

    sample = sub.add_parser("sample", help="Read first rows from a table")
    add_query_options(sample)
    sample.add_argument("--table", required=True, help="Table name")
    sample.add_argument("--limit", type=int, default=20, help="Maximum rows")
    sample.set_defaults(func=command_sample)

    query = sub.add_parser("query", help="Run read-only SQL")
    add_query_options(query)
    query.add_argument("sql", nargs="?", help="SQL text")
    query.add_argument("--sql-file", help="Read SQL from a UTF-8 file")
    query.set_defaults(func=command_query)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
