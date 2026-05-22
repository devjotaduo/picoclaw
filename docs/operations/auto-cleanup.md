# Auto-cleanup & log retention

Status: planned for `155.138.210.187` (live SaaS host).

Three independent mechanisms keeping the VPS from accreting cruft:

1. **`picoclaw-cleanup.timer`** — weekly Docker prune (Sundays 04:00 UTC).
2. **journald retention drop-in** — caps systemd journal at 500 MB / 30 days.
3. **Docker daemon log rotation** — caps each container's JSON log at
   10 MB × 3 files.

Each is intentionally bounded and conservative. None of them touches
tagged images, volumes, customer data, or running containers.

## Why these three specifically

| Source of growth | What grows | Mitigation |
|---|---|---|
| Docker build cache (was 19 GB before the manual cleanup) | `/var/lib/docker/buildkit/` | `picoclaw-cleanup.timer` prunes entries >7 d weekly |
| Dangling images from rolling deploys | `<untagged>` images after each `docker pull` | Same timer, 7-day retention so recent rollback targets survive |
| Container JSON logs | `/var/lib/docker/containers/<id>/*-json.log`, **unbounded by default** | Docker daemon `log-opts` (10 MB × 3 = ~30 MB ceiling per container) |
| systemd journal | `/var/log/journal/` | `SystemMaxUse=500M`, `MaxRetentionSec=30day` drop-in |

## Pipeline

```
Sunday 04:00 UTC
  └─ picoclaw-cleanup.timer fires
     └─ picoclaw-cleanup.service runs picoclaw-cleanup.sh
        ├─ snapshot disk + docker df BEFORE
        ├─ docker image   prune -f --filter "until=168h"   (>=7 days dangling)
        ├─ docker builder prune -f --filter "until=168h"   (>=7 days cache)
        ├─ docker container prune -f                       (stopped only)
        ├─ docker network   prune -f                       (unused only)
        ├─ snapshot disk + docker df AFTER
        └─ WARN if disk still >70 %
```

## What is NEVER pruned

- Tagged images (`picoclaw/saas:latest`, `ghcr.io/devjotaduo/...:main`, `:sha-*`).
- Volumes (Postgres data, controlplane data, tenant state).
- Running containers.
- Anything younger than 7 days — including the deliberately-kept
  `b51b04848dd9` rollback image. It gets pruned only after a week of
  successful CI deploys.

## One-time bootstrap on the VPS

```bash
ssh root@155.138.210.187
cd /tmp && rm -rf picoclaw-bootstrap
git clone --depth 1 https://github.com/devjotaduo/picoclaw.git picoclaw-bootstrap
sudo bash picoclaw-bootstrap/scripts/maintenance/install.sh
```

This installs all three mechanisms. The Docker daemon log-rotation
config is written but **NOT activated** — see "Pending action" at the
end of the installer output. Pick a maintenance window and run
`systemctl restart docker` to apply it to future container recreates.

## Operations

```bash
# Force a cleanup right now (don't wait for Sunday)
systemctl start picoclaw-cleanup.service

# Last weekly run
journalctl -u picoclaw-cleanup.service -n 200 --no-pager

# Next scheduled fire
systemctl list-timers picoclaw-cleanup.timer

# Pause weekly cleanup
systemctl stop picoclaw-cleanup.timer

# Disable on boot
systemctl disable picoclaw-cleanup.timer

# Tighter retention temporarily (e.g. disk panic at 90%)
sudo systemctl edit picoclaw-cleanup.service
# [Service]
# Environment=PICOCLAW_CLEANUP_RETENTION=24h
# systemctl start picoclaw-cleanup.service
```

## Manual emergency cleanup (if the timer isn't enough)

If disk usage spikes to >90 % between weekly runs, the timer's retention
filter (`until=168h`) is too conservative. Bypass it:

```bash
# Aggressive: drop ALL dangling + ALL build cache regardless of age
docker image prune -f -a   # WARN: also removes UNUSED tagged images
docker builder prune -af   # full cache wipe

# Then re-pull anything that vanished
docker pull ghcr.io/devjotaduo/picoclaw-saas:main
# (you'd need to repull picoclaw-launcher:latest, opencrm:latest, etc.
#  if they got swept too — but they're tagged and in-use so safe)
```

The `-a` flag on `image prune` is the difference between "remove dangling"
and "remove anything not actively referenced by a running container".
Default safe mode keeps tagged-but-not-running images alive (good for
rollback). `-a` is the panic button.

## Docker log rotation: why one-time and what to know

`/etc/docker/daemon.json` is updated to:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

**The installer NEVER restarts Docker** because that briefly stops every
container on the host (controlplane, traefik, postgres, opencrm, every
tenant). Pick a maintenance window and run:

```bash
systemctl restart docker
```

After restart, only containers that are subsequently **recreated** pick
up the new log config. The controlplane gets recreated on every
auto-deploy tick that has a new image, so it converts naturally. Tenants
and traefik stay on the original (unbounded) log config until you
explicitly recreate them.

Existing log files at the old (unbounded) size are not retroactively
truncated. If a tenant has 4 GB of accumulated JSON log, recreating it
will swap to the rotated driver but the old 4 GB file persists. To
reclaim:

```bash
# Identify offenders
du -sh /var/lib/docker/containers/*/*-json.log | sort -h | tail -5

# Truncate (NOT delete — keeps inode for the running container)
truncate -s 0 /var/lib/docker/containers/<id>/<id>-json.log
```

## What is deliberately NOT included

- **Daily prune.** Once a week is enough for this workload; higher
  frequency cuts into the rollback safety net without freeing
  meaningful disk.
- **`docker image prune -a` in the timer.** Auto-removing every
  not-currently-running tagged image could nuke a rollback target you
  haven't pulled in a week. Reserved for the manual emergency path.
- **Postgres VACUUM scheduling.** Autovacuum handles it; full-table
  rewrites need human judgement.
- **GHCR retention.** Old `:sha-*` image tags accumulate in the
  registry, not on this VPS. Public repo → no storage cost. Treat as a
  separate concern.
- **Backup pruning** (`/srv/saas/backups/`). Retention policy is a
  business decision, not an automatable default.
