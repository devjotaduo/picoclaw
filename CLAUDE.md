# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Always use `make` targets when one exists — they enforce the right build tags, ldflags, and `go generate` ordering.

```bash
make deps           # download + verify go modules (run after pulling)
make generate       # run `go generate ./...` (regenerates embedded workspace assets)
make build          # build cmd/picoclaw for the current platform (runs generate first)
make build-launcher # build picoclaw-launcher (web console). Requires web/frontend deps:
                    #   (cd web/frontend && pnpm install --frozen-lockfile)
make test           # run all tests
make vet            # static analysis (separately covers root + web/backend)
make lint           # golangci-lint + docs consistency check
make fmt            # format via golangci-lint fmt
make check          # full pre-commit: deps + fmt + vet + test + lint-docs
make lint-docs      # check Markdown layout/naming conventions only
make mem            # build cmd/membench, download LOCOMO dataset if absent, run benchmark
```

Single-test run:
```bash
go test -run TestName -v ./pkg/session/
go test -bench=. -benchmem -run='^$' ./...   # benchmarks
```

The web/ subtree has its own Makefile. Root `make test`/`make vet` recurse into it. To work inside it directly:
```bash
cd web/backend && go vet ./...
cd web/frontend && pnpm dev          # Vite dev server with hot reload
cd web/frontend && pnpm build:backend  # builds + copies dist into web/backend/dist for embed
```

Pre-PR: **`make check`** must pass locally. See `.golangci.yaml` for enabled linters.

## Build tags

`GO_BUILD_TAGS` defaults to `goolm,stdjson`:
- `goolm` — pure-Go Olm crypto for Matrix channel. Dropped for `mipsle` builds (`GO_BUILD_TAGS_NO_GOOLM`).
- `stdjson` — use stdlib `encoding/json` instead of a heavier alternative; reduces binary size on resource-constrained targets.
- `whatsapp_native` — opt-in tag for the whatsmeow-based WhatsApp channel. Adds ~30MB to the binary, so it's gated behind `make build-whatsapp-native` rather than the default.

When adding a new channel that links heavy native code, follow the same pattern: build tag + a dedicated `make build-*` target that compiles across the platform matrix.

## The two binaries

This repo produces two distinct executables that share most of `pkg/`:

| Binary | Source | Purpose |
|---|---|---|
| `picoclaw` | `cmd/picoclaw/` | CLI: `agent` (one-shot query), `gateway` (long-running multi-channel bot), `onboard`, `auth`, `model`, `skills`, `mcp`, `status`. |
| `picoclaw-launcher` | `web/backend/` | HTTP server on :18800 wrapping the gateway, embedding the React/Vite SPA from `web/frontend/dist`. Acts as a desktop-app-style web console. |

The launcher embeds the frontend via `//go:embed` against `web/backend/dist`, populated by `(cd web/frontend && pnpm build:backend)`. `make build-launcher` runs both steps. There is a `.gitkeep` in `web/backend/dist/` so the embed directive stays valid before any frontend build — don't delete it.

## $PICOCLAW_HOME and runtime state

Every runtime artifact lives under one configurable directory:

- `$PICOCLAW_HOME` (env) overrides; default `~/.picoclaw` (logic in `pkg/config/envkeys.go`).
- `$PICOCLAW_CONFIG` overrides the config file path independently; default `$PICOCLAW_HOME/config.json`.

Inside that directory you'll find `config.json`, `.security.yml` (permissions/access control, loaded separately), `auth.json` (OAuth credentials per provider), `workspace/` (sessions, memory, skills), `state/state.json` (atomic-write last-channel/chat tracker), `dashboardauth.db` (single-row SQLite holding the bcrypt hash for the launcher login), and per-channel state subdirs (e.g. `whatsapp/store.db` for whatsmeow's session SQLite, `channels/weixin/sync/`).

Core Picoclaw runtime remains single-home and isolated: one `$PICOCLAW_HOME` is one instance. The SaaS control plane in `cmd/picoclaw-saas` builds multi-tenancy around that boundary by provisioning one launcher container and one bind-mounted home per tenant, then routing public access through a central RBAC gateway.

## Configuration

`pkg/config/config.go` defines a single `Config` struct with ~15 fields (Isolation, Agents, Session, Channels, ModelList, Gateway, Events, Hooks, Tools, Voice, …). Each top-level field has env-var overrides via `caarlos0/env` struct tags (e.g. `PICOCLAW_CHANNELS_TELEGRAM_TOKEN`, `PICOCLAW_AGENTS_DEFAULTS_MODEL_NAME`). The exhaustive list is in `pkg/config/envkeys.go`.

LLM credentials in `ModelList[].APIKey` accept three forms (resolved in `pkg/credential/credential.go`): plaintext (`sk-…`), file (`file://name.key` reading from `$PICOCLAW_HOME/name.key`), or AES-256-GCM encrypted (`enc://<base64>`, decrypted via `PICOCLAW_KEY_PASSPHRASE` env). Don't store plaintext keys in `config.json` for anything beyond local dev.

All provider configs support `api_base` (`pkg/providers/factory_provider.go` → `ResolveAPIBase`). This is the override point for swapping in a LiteLLM proxy or any OpenAI-compatible endpoint without touching code.

## Channel model

Channels are pluggable adapters under `pkg/channels/<name>/`. Every channel implements the `Channel` interface in `pkg/channels/interfaces.go` and embeds `BaseChannel` (`pkg/channels/base.go`) for the running-state flag, allow-list logic, message-length splitting, media store handle, and event logging.

Key invariant: **a channel keeps stateful connections** (Telegram long-poll, WhatsApp websocket, Matrix sync, IRC TCP, …). The `pkg/channels/manager.go` orchestrator owns lifecycle (`Start`/`Stop`) and routes inbound messages to the agent and outbound responses to the right channel. When adding a channel, mirror `BaseChannel` usage from a similar existing one (Telegram for HTTP-poll; Matrix for websocket-like) rather than re-implementing the boilerplate.

Sender identity is canonicalized as `"platform:id"` strings (`pkg/identity/identity.go`). Allow-list matching uses `MatchAllowed(sender, allowEntry)` — don't compare raw IDs.

## Agent / session / memory

- `pkg/agent/instance.go` defines `AgentInstance` with its own `Workspace`, `RestrictToWorkspace`, `AllowReadOutsideWorkspace`, tool registry, and session store.
- Sessions persist as JSONL via `pkg/memory/jsonl.go` (one file per session key, plus `<key>.meta.json`). Keys with `:`, `/`, `\` are sanitized for filename safety. Legacy `pkg/session/session_store.go` interfaces still exist for migration paths.
- Memory store supports vector embeddings for RAG; consumers go through the `SessionStore` interface so the JSONL backend can be swapped without touching call sites.

## Subprocess isolation

`pkg/isolation/runtime.go` sandboxes *child processes* (the `exec` tool, CLI providers like `claude-cli`/`codex-cli`, MCP stdio servers, hooks) — **not** the main picoclaw process itself. It's opt-in (`config.isolation.enabled`) and platform-specific: bubblewrap (`bwrap`) on Linux, restricted tokens + low integrity + Job Object on Windows, no-op on macOS. The `runtime-user-env/` subtree inside `$PICOCLAW_HOME` holds redirected `HOME`/`TEMP`/etc. that the sandboxed children see.

When implementing a new tool that shells out, route the `exec.Cmd` through `isolation.Runtime` rather than building it directly.

## Cross-platform build matrix

`make build-all` targets nine triples including some quirky ones. Two gotchas to be aware of when touching the Makefile or adding deps:

- **MIPS LE**: requires `GOMIPS=softfloat` and the `goolm` tag stripped. After `go build`, `PATCH_MIPS_FLAGS` rewrites four bytes at offset 36 of the ELF to set the NaN2008 flag — kernels like Ingenic X2600 reject the binary otherwise. Don't remove this dd invocation.
- **loong64**: `creack/pty@v1.1.9` ships no `ztypes_loong64.go`; `PTY_PATCH_LOONG64` writes a minimal one into the module cache. When bumping the pty dep, verify the patch is still needed.

`build-android-bundle` produces a universal zip with the binaries renamed to `lib*.so` so they sit inside a `jniLibs/arm64-v8a/` directory of the Android wrapper app — the names matter for the Android packaging system.

## When working on this codebase

- The version metadata (`Version`, `GitCommit`, `BuildTime`, `GoVersion`) is injected via `-ldflags -X github.com/sipeed/picoclaw/pkg/config.Var=…`. If you add a new metadata field, register it in `pkg/config/buildinfo.go` and add the `-X` flag to every relevant `go build` invocation in the Makefile.
- AI-assisted contributions are first-class (see `CONTRIBUTING.md`): every PR must declare the AI involvement level, and reviewers apply extra security scrutiny to file-path handling, command execution, and channel handlers (commit `244eb0b` is cited as a real prior sandbox-escape incident).
- The `docs/` tree has its own consistency lint via `scripts/lint-docs.sh` (called from `make lint-docs` and `make lint`); run it after adding or moving Markdown files.
- SaaS tenancy now lives in this repo under `cmd/picoclaw-saas`, `internal/saas`, `web/saas-admin`, and `docker/saas`. Changes to Picoclaw's home-dir layout, dashboard auth schema (`web/backend/dashboardauth/sql.go`), launcher CLI flags, or trusted gateway auth headers can break tenant provisioning — coordinate those surfaces with `docs/architecture/saas-tenancy.md`.
