# Auto-deploy (CI → GHCR → VPS pull)

Status: planned for `155.138.210.187` (live SaaS host).

The SaaS controlplane container auto-updates from `ghcr.io/devjotaduo/picoclaw-saas:main`
every 2 minutes via a systemd timer on the VPS. CI builds the image on every
push to `main` that touches controlplane code; the VPS polls and recreates
the container only when the image actually changed.

**Tenant containers (`tenant-<id>`) are NOT touched by this mechanism.**
They run `picoclaw-launcher:latest` (a different image), hold live
customer state (sessions, dashboardauth, whatsapp), and need intentional
update flows.

## Topology this assumes

- The VPS is fully containerized (no Go/Node toolchain).
- `controlplane` container runs `picoclaw/saas:latest` (local tag).
- Compose file at `/srv/saas/picoclaw/docker/saas/docker-compose.yml`,
  project name `picoclaw-saas`.
- Docker 20.10+ with `compose` v2 plugin.
- ~134 MiB RAM headroom is enough — pulls + recreate happen in <100 MiB.

If your topology differs (e.g. `picoclaw-main-dev.service` running from a
source checkout on a separate dev box), this mechanism is the wrong fit
and you want the older source-pull pattern instead — see git history of
`scripts/auto-deploy/` for the previous implementation (reverted in #65
because it didn't match the prod box).

## Pipeline

```
push to main
   │
   ▼
.github/workflows/release-controlplane.yml
   │ builds docker/saas/Dockerfile
   │ pushes ghcr.io/devjotaduo/picoclaw-saas:main
   │             :sha-<short>  (immutable per-commit)
   ▼
~2 min later, on the VPS:
   │ /etc/systemd/system/picoclaw-deploy.timer fires
   ▼
/usr/local/bin/picoclaw-deploy.sh
   │ docker pull ghcr.io/.../picoclaw-saas:main
   │ docker tag  ghcr.io/.../picoclaw-saas:main picoclaw/saas:latest
   │ compare image ID vs running container
   │ if different:
   │   docker compose -f .../docker-compose.yml up -d --no-deps controlplane
   ▼
new controlplane container live
```

## Why pull-based over GitHub Actions SSH

- **Zero CI secrets pointing at the VPS.** GitHub never holds SSH keys
  or deploy tokens for this box. A leaked Actions token can publish a
  bad image to GHCR but can't directly touch prod.
- **GHCR auth lives only on the VPS.** A PAT with `read:packages` sits
  in `/root/.docker/config.json` on the box itself — out of the GitHub
  blast radius.
- **Pause is local.** `systemctl stop picoclaw-deploy.timer` — no
  GitHub round-trip.
- **Rollback by SHA.** The workflow tags `:sha-<short>` on every build;
  to roll back, `docker pull ghcr.io/.../picoclaw-saas:sha-XXXXXXX &&
  docker tag ... picoclaw/saas:latest && systemctl start picoclaw-deploy`.

Trade-off: up to 2 min latency after merge before the change lands.
For a SaaS where image-rebuild + recreate already takes ~30 s, this is
in the noise.

## One-time bootstrap on the VPS

```bash
ssh root@155.138.210.187

# 1. Authenticate Docker against GHCR (only needed if the package is
#    private; public packages skip this step).
docker login ghcr.io -u <github-user>
# paste a PAT with `read:packages` scope only — NO write/admin.

# 2. Make sure /srv/saas/picoclaw/ has the auto-deploy scripts. If it's
#    stale (synced from a dev box), pull a fresh copy. The scripts are
#    in the repo at scripts/auto-deploy/. One way:
cd /tmp && git clone https://github.com/devjotaduo/picoclaw.git picoclaw-bootstrap
cd picoclaw-bootstrap

# 3. Install the timer.
sudo bash scripts/auto-deploy/install.sh

# 4. Verify.
systemctl list-timers picoclaw-deploy.timer
journalctl -u picoclaw-deploy.service -f &
systemctl start picoclaw-deploy.service   # trigger manual first run
```

You can clean up `/tmp/picoclaw-bootstrap` after install — the timer
runs `picoclaw-deploy.sh` from `/usr/local/bin/`, not from the clone.

## Operations

```bash
# Watch deploys live
journalctl -u picoclaw-deploy.service -f

# What changed last time?
journalctl -u picoclaw-deploy.service -n 100 --no-pager

# When does it fire next?
systemctl list-timers picoclaw-deploy.timer

# Force a check right now (don't wait for the timer)
systemctl start picoclaw-deploy.service

# Pause without disabling (resumes on `systemctl start ...timer`)
systemctl stop picoclaw-deploy.timer

# Disable permanently (won't resume on reboot)
systemctl disable --now picoclaw-deploy.timer

# Roll back to a specific build
docker pull ghcr.io/devjotaduo/picoclaw-saas:sha-XXXXXXX
docker tag  ghcr.io/devjotaduo/picoclaw-saas:sha-XXXXXXX picoclaw/saas:latest
docker compose -p picoclaw-saas \
  -f /srv/saas/picoclaw/docker/saas/docker-compose.yml \
  up -d --no-deps controlplane

# Reinstall the script after editing it in this repo
sudo bash /tmp/picoclaw-bootstrap/scripts/auto-deploy/install.sh
```

## Pinning to a specific build

The deploy script reads `$PICOCLAW_DEPLOY_IMAGE` so you can override
the tracked tag without editing the script:

```bash
sudo systemctl edit picoclaw-deploy.service
# In the editor:
#   [Service]
#   Environment=PICOCLAW_DEPLOY_IMAGE=ghcr.io/devjotaduo/picoclaw-saas:sha-abc1234
```

This is the canonical "freeze deploys during an incident" mechanism.
Drop the override and `daemon-reload` to resume tracking `:main`.

## Failure modes

| Failure | Behaviour |
|---|---|
| `docker pull` fails (auth/network) | Script exits 1; timer retries in 2 min. Container keeps running old image. |
| Pulled image is broken (compile-time bug snuck through CI) | `docker compose up -d` recreates the container. Healthcheck may fail; container goes into restart loop. Visible in `docker ps`. **No automatic rollback** — you `docker tag ... sha-<previous>` manually. |
| GHCR rate limit | Same as auth failure. |
| Timer overlapping with slow deploy | `flock` makes the second invocation no-op. |
| Compose file moved/missing | `install.sh` checks at install time. At runtime, deploy fails loudly. |
| Tenant container needs the new image | Out of scope. Tenants run `picoclaw-launcher:latest` (different image). |

## What this does NOT do

- **No tenant updates.** Push tenant container updates via the admin
  dashboard's "rebuild tenant" flow.
- **No DB migration gating.** Migrations run in-process when the
  controlplane starts (`internal/saas/store/migrations/`). If you
  introduce a migration that needs a specific deploy order, don't
  merge to main without that order arranged.
- **No automatic rollback.** If a deploy goes wrong you've got 2 min
  before the next tick re-confirms the same broken image. Use the
  `Environment=PICOCLAW_DEPLOY_IMAGE=...` pin above to freeze on a
  good SHA while you fix forward.
- **No alerting.** Failures land in `journalctl` only. Add an
  `OnFailure=` to `picoclaw-deploy.service` if you want pager-style
  notification.
