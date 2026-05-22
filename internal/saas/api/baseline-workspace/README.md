# Baseline workspace

This directory is embedded into the controlplane binary at compile time
via `//go:embed all:baseline-workspace`. The bootstrap (`workspaces_bootstrap.go`,
`EnsureDefaultWorkspace`) extracts it into the freshly-created default
workspace's `home/workspace/` directory **only when the host path
`/srv/picoclaw/workspace/` is not present** — that legacy path was used
by pre-Workspaces installs and remains supported for live environments
that still bind-mount it.

## Why a baseline at all

`AutoProvisioner.Run` calls `CopyWorkspaceHome` which copies the
workspace's `home/` subtree verbatim into the new tenant's volume. A
tenant boots with nothing in `workspace/` if the source is empty — the
launcher then has no agent persona to load and any chat fails with a
"no agent configured" error.

The embedded baseline guarantees a freshly-bootstrapped install always
provisions tenants with *something* the launcher can load, even if the
operator never edits the workspace via the admin UI.

## Contents

- `AGENT.md` — generic placeholder agent prompt (Portuguese, "assistente")
- `SOUL.md` — placeholder identity
- `behavior.json` — sane defaults (DMs on, groups via mention only,
  no business-hours gate)
- `agents/.gitkeep`, `skills/.gitkeep`, `memory/.gitkeep` — empty
  scaffolding so the directory layout matches what tenants expect

## What this is NOT

- Not jotaduo/Picoclaw-specific. The baseline is intentionally generic
  so the open-source repo doesn't ship customer content.
- Not a complete agent. Operators MUST customise post-provision via the
  admin UI (or by editing the workspace at `<WorkspaceDir>/default-business/home/workspace/`
  on the host before the first provision).
- Not the source of truth for an operator's actual workspace template.
  Edits to files here only affect *future fresh-install bootstraps* —
  existing workspaces are untouched.

## Updating the baseline

Edits land via normal PR. Next controlplane build embeds the new
content; next fresh-install bootstrap uses it. Existing installs keep
whatever they already have.
