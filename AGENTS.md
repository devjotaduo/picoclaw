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

## SaaS Dev Loop

When the user asks to develop, debug, or test SaaS/controlplane/tenant launcher
work in dev mode, prefer `docker/saas/scripts/dev-sync.sh` and the
`make saas-dev-*` targets before rebuilding Docker images.

Use a Docker image rebuild only when Dockerfiles, base image layers, OS
packages, image-only assets, or durable production image validation are part of
the task.
