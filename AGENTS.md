# Agent Notes

## Task Completion Protocol (git automation)

When you finish a task, do NOT just hand back to the user with a dirty working
tree. Use `scripts/agent-finish.sh` to validate + commit + push in one step:

```bash
bash scripts/agent-finish.sh --message "<scope>: <short subject>" \
                             --body "<optional body>"
```

What it does (in order):

1. **Selective validation** — runs only the suites relevant to the touched paths:
   - `*.go` / `go.mod` / packages under `pkg|cmd|internal|web/backend` → `go vet -tags goolm,stdjson` on the touched packages.
   - `*.md` → `scripts/lint-docs.sh`.
   - `*.json` → parsed via `python` (fallback `node`).
2. **Upstream sync** — fetches and reads `ahead`/`behind`:
   - clean + behind → fast-forward.
   - dirty + behind → autostash, rebase, pop.
   - diverged (both ahead AND behind) → exits 3, asks for manual resolve. Never auto-merges.
3. **Scope filtering** — stages everything except paths matched by `scripts/agent-finish.ignore` (generated files, logs, `.env`, etc.). Pass `--scope path1 path2 ...` to limit further.
4. **Large-changeset guard** — refuses to commit when `>50` files OR `>2000` line diff unless `--yes` is given. Forces the agent to be deliberate.
5. **Commit** — always appends the `Co-authored-by: Copilot` trailer required by repo policy.
6. **Push** — only when the branch is strictly ahead. With `--amend`, uses `--force-with-lease`.

Useful flags:

| flag | use case |
|---|---|
| `--no-commit` | "just validate" — runs suites and reports, no git writes. |
| `--no-push` | commit locally, defer push. |
| `--amend` | tack onto HEAD (and force-with-lease the push). |
| `--scope <paths>` | only stage these paths; everything else stays dirty. |
| `--yes` | confirm a large changeset non-interactively. |

Rules of thumb for agents:

- **Never commit `internal/saas/config/config.go`, `workspace/heartbeat.log`, `web/frontend/src/routeTree.gen.ts`, or unrelated files you didn't touch.** If the working tree has changes from a different task, use `--scope` to limit your commit to your own files; leave the rest dirty for the original author.
- **Never `git push --force` without `--force-with-lease`.** The script handles this for `--amend`; do not bypass it.
- **Never auto-merge a diverged branch.** Exit 3 from the script is a hard signal — surface it to the user and stop.
- **One topic per commit.** If you touched multiple unrelated areas, run the script multiple times with `--scope`.
- **For "large" refactors** (>50 files), explain the scope to the user before passing `--yes`.

## Deploy: GitHub Actions only

Production deploys go strictly through `.github/workflows/release-controlplane.yml`
→ GHCR → VPS `picoclaw-deploy.timer`. Never push binaries, source code, or
manually-built images onto the prod VPS. For local SaaS dev iteration, spin
the stack up with `docker compose -f docker/saas/docker-compose.yml -f
docker/saas/docker-compose.dev.yml --env-file .env up -d --build`.

## Internal agents & dev skills in Docker

The launcher container (`docker/Dockerfile.launcher`, image
`picoclaw-launcher:latest`) ships with the runtimes needed by the dev/operator
skill set:

- CLIs: `gh` (github-cli), `tmux`, `curl`, `jq`
- Runtimes: `nodejs` + `npm`, `python3` + `pip`

This means **internal agents inside any tenant container** can use the
following skills out-of-the-box without a heavy rebuild: `github`, `tmux`,
`weather`, `summarize`, `skill-creator`, plus anything that needs `node`/`pnpm`
or `python3`/`pip` at runtime.

The canonical internal agent is `workspace/agents/operador/` — copy/adapt its
`AGENT.md` when adding new internal personas. Customer-facing personas (Sofia,
Clara, Marcos, Camila) should **not** list dev skills in their `skills:`
frontmatter — limit them to atendimento/vendas/onboarding skills.

Skills that need Chromium (`agent-browser`) connect to a **shared
`browser-sidecar` container** over CDP via `$BROWSER_CDP_URL`. The launcher
image ships only the `agent-browser` Node CLI (~5MB) — Chromium lives in a
single dedicated container on the `saas_llm` network. To enable browser
automation in SaaS:

1. `docker compose -f docker/saas/docker-compose.yml up -d browser-sidecar`
2. Set `BROWSER_CDP_URL=http://browser-sidecar:9222` in the controlplane env (default already).
3. Restart the tenant containers (or wait for the next provision).

The skill auto-detects `$BROWSER_CDP_URL` and routes to remote when present.
For pure local development without the sidecar, `docker/Dockerfile.heavy` still
exists with bundled Chromium + Playwright (image `picoclaw-heavy`).

