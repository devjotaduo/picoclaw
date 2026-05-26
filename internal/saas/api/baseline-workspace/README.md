# Baseline workspace

This directory is embedded into the controlplane binary at compile time
via `//go:embed all:baseline-workspace` (see `../workspaces_bootstrap.go`).
The bootstrap (`EnsureDefaultWorkspace`) extracts it into the
freshly-created `default-business` workspace's `home/` directory **only
when the host path `/srv/picoclaw/workspace/` is not present** — that
legacy path was used by pre-Workspaces installs and remains supported
for live environments that still bind-mount it.

## DO NOT EDIT BY HAND

This whole tree is **auto-generated** by `scripts/sync-baseline-workspace.py`
from the repo's top-level `workspace/` directory. Edits made here
directly will be overwritten on the next `make generate` / `make build`
run. The only files that survive sync are:

- `README.md` (this file)
- `SYNCED_FROM` (manifest written by the sync script)
- any `.gitkeep` markers

To change the baseline, **edit `workspace/` at the repo root**, then run:

```bash
make sync-baseline
git add internal/saas/api/baseline-workspace/
git commit -m "sync baseline-workspace"
```

`make check-baseline-sync` enforces this — CI will fail if you edit
`workspace/` but forget to regenerate + commit the baseline.

## Why a baseline at all

`AutoProvisioner.Run` calls `CopyWorkspaceHome` which copies the
workspace's `home/` subtree verbatim into the new tenant's volume. A
tenant boots with nothing if the source is empty — the launcher then
has no agent persona to load and any chat fails with a "no agent
configured" error.

The embedded baseline guarantees a freshly-bootstrapped install always
provisions tenants with the **canonical Jotaduo workspace** (Sofia
discovery, Catarina deepening, the full skill catalog including
`onboarding-state`, `lead-qualification`, `crm-bridge`, etc.) so a
brand-new operator can immediately exercise the public→cliente
promotion flow without re-uploading workspace tarballs.

## Why sanitization at sync time

The sync script (`scripts/sync-baseline-workspace.py`):

- **Drops runtime state**: `sessions/`, `whatsapp/`, `state/`, `output/`, `*.log`, `*.tmp.json`
- **Drops operator secrets**: `auth.json` (OAuth credentials)
- **Empties `memory/` contents** while preserving filenames as stubs
  (so agents that reference `memory/<file>.md` still find the file,
  but no client data ships in the binary)
- **Normalizes `config.json`**: replaces `api_keys` with `${LITELLM_KEY}`
  placeholder, forces `agents.defaults.workspace` to the Linux
  container path `/root/.picoclaw/workspace`, strips Windows/Mac dev
  paths from per-agent workspace fields
- **Drops dev scratch**: `gerar_pdf_mamiferos.py`, `mamiferos_*.html`,
  `RELATORIO-*.md`

This makes the baseline safe to ship in the binary even if `workspace/`
has been used as a dev sandbox with real conversations.

## Manifest

`SYNCED_FROM` records the commit hash + timestamp of the sync. When
something looks wrong in a tenant, check this file to know which
version of `workspace/` produced the baseline — useful for postmortems.

## What this is NOT

- Not the runtime config for a specific tenant. Each tenant has its
  own copy in `/srv/saas/tenants/<id>/` (the volume) which the
  provisioner customises (`${LITELLM_KEY}` substitution, dashboardauth
  seed, ui-visibility profile, etc.).
- Not where to fix bugs in agents/skills. Edit `workspace/` at the
  repo root and let sync propagate.

## Updating the baseline

Edits land via PRs that touch `workspace/`. `make generate` (which
runs `go generate ./...`) invokes the sync automatically, so the
baseline in the PR matches the workspace state. Next controlplane
build embeds the new content; next fresh-install bootstrap uses it.
Existing tenants keep whatever they already have (provisioner copies
once at create time — re-sync the baseline doesn't migrate them).
