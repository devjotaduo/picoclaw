# Host.fbk Reference

Known observations from the project-root `Host.fbk`:

- Relative path: `Host.fbk`
- Size observed during skill creation: about 6.9 MiB
- Embedded original database path: `C:\TSD\HOST\Host.fdb`
- Embedded backup date string: `Fri Feb 03 10:27:31 2023`
- The Unix `file` command may misidentify it as an Atari bitmap. Treat it as a Firebird backup because `strings` exposes Firebird system object names and the original `.fdb` path.
- Validation during skill creation restored the backup with Ubuntu `firebird3.0-utils` and found 211 user tables.
- Tables such as `CLIENTES` include personal-data-shaped columns (`CPF_CNPJ`, phone, address, email). Avoid printing row samples unless the user explicitly asks.

Use `fbk_reader.py peek Host.fbk` for a quick non-invasive check. Use `tables`, `schema`, `sample`, and `query` only after Firebird `gbak` and `isql-fb`/`isql` are available.
