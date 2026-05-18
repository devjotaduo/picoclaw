---
name: read-host-fbk
description: Read, restore, inspect, and query Firebird backup files (.fbk), especially the project-root Host.fbk database backup. Use when the user asks to read Host.fbk, open an .fbk backup, list Firebird tables, inspect schema, sample rows, export query output, or troubleshoot gbak/isql access to Firebird data.
---

# Read Host FBK

Use this skill to turn a Firebird `.fbk` backup into readable table data. Firebird backup files are not SQL dumps; restore them to an `.fdb` database with `gbak`, then query the restored database with `isql-fb` or `isql`.

## Quick Start

Prefer the bundled helper:

```bash
python3 .agents/skills/read-host-fbk/scripts/fbk_reader.py tools
python3 .agents/skills/read-host-fbk/scripts/fbk_reader.py peek Host.fbk
python3 .agents/skills/read-host-fbk/scripts/fbk_reader.py tables Host.fbk
python3 .agents/skills/read-host-fbk/scripts/fbk_reader.py schema Host.fbk --table NOME_DA_TABELA
python3 .agents/skills/read-host-fbk/scripts/fbk_reader.py sample Host.fbk --table NOME_DA_TABELA --limit 20
python3 .agents/skills/read-host-fbk/scripts/fbk_reader.py query Host.fbk "SELECT FIRST 20 * FROM NOME_DA_TABELA"
python3 .agents/skills/read-host-fbk/scripts/fbk_reader.py query Host.fbk "SELECT COUNT(*) FROM CLIENTES" --output workspace/host-fbk-reader/clientes-count.txt
```

The helper restores into `workspace/host-fbk-reader/` by default and reuses the restored `.fdb` while it is newer than the `.fbk`.
Pass `--verbose-restore` only when diagnosing `gbak` restore failures.

## Workflow

1. Run `tools` to verify that `gbak` and `isql-fb`/`isql` are installed.
2. Run `peek` to confirm the backup path, timestamp, and obvious strings.
3. Run `tables` to restore the backup if needed and list user tables.
4. Run `schema` for relevant tables before writing queries.
5. Run `sample` or `query` for read-only data exploration.

If Firebird tools are missing, install the Firebird utilities for the host OS, then rerun `tools`. On Debian/Ubuntu, the package is commonly named `firebird3.0-utils` or `firebird4.0-utils`; use the distro's package index to choose the available version.

## Query Rules

- Default to read-only SQL. The helper refuses non-`SELECT`/`WITH` statements unless `--allow-nonselect` is set.
- Add explicit row limits for broad queries, for example `SELECT FIRST 100 * FROM TABELA`.
- Run queries sequentially against the restored local `.fdb`; parallel embedded connections can produce Firebird lock/engine-instance errors.
- Do not run destructive statements against the restored database unless the user explicitly asks and the restored copy is disposable.
- For tables with quoted or mixed-case names, pass the exact table name to `--table`; the helper quotes identifiers for `sample`.

## Host.fbk Notes

Read `references/host-fbk.md` before doing project-specific work with the bundled `Host.fbk`. It records the observed source path, backup date string, and local caveats.

## Troubleshooting

- `gbak not found`: install Firebird utilities or run in an environment that has them.
- `isql not found`: install Firebird utilities; the binary may be named `isql-fb`.
- Authentication failures: retry with `--user` and `--password`. The default is `SYSDBA` / `masterkey`.
- Restore fails due ODS/version mismatch: use Firebird utilities from the same or newer major Firebird version than the source database.
- `file Host.fbk` reports an unrelated format: ignore `file(1)` for this backup if `strings` shows Firebird backup metadata.
