# Auto-deploy (pull-based)

Status: production on `ia.jotaduo.com` (155.138.210.187) since 2026-05-21.

The host launcher and the SaaS controlplane container auto-update from
`origin/main` every 2 minutes via a systemd timer running on the VPS.

**Tenant containers (`tenant-<id>`) do NOT auto-update.** They carry
live customer state (sessions, dashboardauth, whatsapp store) — pushing
a binary swap on every push to main would flap real conversations. Update
tenants intentionally via the admin dashboard or
`make saas-dev-tenant-<id>` when you mean to.

## Why pull-based (and not GitHub Actions SSH)

- **No CI secrets needed.** Nothing in GitHub has SSH access to the VPS.
  A leaked Actions token can't reach prod.
- **Already fits the runtime.** `picoclaw-main-dev.service` already runs
  from a working-tree checkout at `/root/picoclaw`. The timer just
  formalises the `git pull && systemctl restart` you'd run manually.
- **Trivial pause.** `systemctl stop picoclaw-deploy.timer` — no GitHub
  ceremony, no PR reverts.
- **Lower blast radius.** Worst case the script is buggy → it runs only
  on the VPS itself, where you already have full access.

The trade-off is latency: up to 2 minutes after a merge before the change
lands. For a SaaS where the host launcher already takes ~30s to restart on
Go changes, this is in the noise.

## What the script restarts

The deploy script computes `git diff --name-only LOCAL..REMOTE` BEFORE
moving HEAD, then decides:

| Changed path matches | Action |
|---|---|
| `*.go`, `go.mod`, `go.sum` | `systemctl restart picoclaw-main-dev.service` (~30s) |
| `cmd/picoclaw-saas/**`, `internal/saas/**`, `web/saas-admin/**` | `make saas-dev-controlplane` (sync binary into `controlplane` container, no image rebuild) |
| `web/frontend/**` only | nothing — Vite hot-reloads from the working tree |
| `docs/**`, `*.md`, anything else | `git reset --hard` only |

Both restart paths can fire in one tick (host + controlplane).

## Files in this repo

```
scripts/auto-deploy/
├── picoclaw-deploy.sh        # The actual deploy logic
├── picoclaw-deploy.service   # systemd oneshot unit
├── picoclaw-deploy.timer     # systemd timer (every 2 min)
└── install.sh                # idempotent installer
```

The repo at `/root/picoclaw` on the VPS contains these, so re-installing
is just `bash scripts/auto-deploy/install.sh`.

## First-time install on a new VPS

Pre-requisites:
- `/root/picoclaw` is a checkout of this repo, tracking `origin/main`
- `picoclaw-main-dev.service` already installed and running
- `make saas-dev-controlplane` works manually
- `flock`, `git`, `systemctl`, `make` on PATH (default on Ubuntu 24.04)

```bash
cd /root/picoclaw
git pull origin main
sudo bash scripts/auto-deploy/install.sh
```

That's it. The installer enables AND starts the timer. First tick fires
~2 min after install or boot.

## Operations

```bash
# Watch deploys live
journalctl -u picoclaw-deploy.service -f

# Last 100 lines from any deploy run
journalctl -u picoclaw-deploy.service -n 100 --no-pager

# When does it fire next?
systemctl list-timers picoclaw-deploy.timer

# Manual trigger (don't wait for the timer)
systemctl start picoclaw-deploy.service

# Pause without disabling (resumes on `systemctl start ...timer`)
systemctl stop picoclaw-deploy.timer

# Disable permanently (won't come back after reboot)
systemctl disable --now picoclaw-deploy.timer

# Reinstall after editing the .sh / .service / .timer in the repo
sudo bash /root/picoclaw/scripts/auto-deploy/install.sh
```

## Refusing to deploy when the working tree is dirty

The script bails with a non-zero exit if `/root/picoclaw` has uncommitted
modifications. This is intentional: if you hand-edited a file on the box
for a hotfix, an auto `git reset --hard origin/main` would silently wipe
it. Instead you see:

```
ERROR: dirty working tree at /root/picoclaw; refusing to overwrite.
Inspect with: cd /root/picoclaw && git status
```

Either commit/discard the local change, or `systemctl stop
picoclaw-deploy.timer` while you debug.

## Failure modes and what happens

| Failure | Behaviour |
|---|---|
| `git fetch` fails (network blip) | Script exits non-zero; timer retries in 2 min. |
| Compile error in new main | `systemctl restart` reports the failure in journal; the previous binary stays running until you push a fix. (Wait — actually `systemd` will mark the unit failed; verify behaviour on first real incident.) |
| `make saas-dev-controlplane` fails | Script logs and exits 1; controlplane keeps running old binary. |
| Overlapping timer ticks (slow deploy) | `flock` makes the second one no-op. |
| Force-push that rewrites `origin/main` | `git reset --hard` follows the new tip. Intentional. |

## What this does NOT do

- **No tenant container updates.** See top of doc.
- **No image rebuilds.** Only `make saas-dev-controlplane` (binary sync). If
  you change Dockerfiles, OS packages, or anything that needs a real image
  build, do it manually.
- **No DB migrations gating.** Migrations run inside the app on startup
  (`internal/saas/store/migrations/`). If you add a migration that needs a
  specific deploy order (e.g. backfill before code switch), don't merge it
  to main without that order arranged.
- **No alerting on failure.** A failed deploy lands in `journalctl` only.
  If you want pager-style alerts, add it on top of `picoclaw-deploy.service`
  via `OnFailure=`.
