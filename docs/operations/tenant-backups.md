# Tenant data backups (daily, R2, encrypted)

Status: active for `155.138.210.187`.

Live tenant data at `/srv/saas/tenants/` (per-tenant subdirs containing
WhatsApp store, sessions, dashboard auth, workspace, memory) is the only
state on this VPS that is **not recoverable from git**. This timer pushes
a daily, encrypted, deduplicated snapshot to Cloudflare R2 via restic.
The same snapshot also includes the institutional Jotaduo WhatsApp sidecar
state at `/srv/picoclaw/jotaduo-wa/`, `/etc/picoclaw/`, and the Postgres
logical dump staging dir.

Source code, workspace templates, Docker images, postgres schema, etc.
are all out of scope here — they have their own paths to recovery.

## Why restic over plain tarball + rclone

- **Content-addressable dedup**: 30 daily snapshots cost ~1 full backup +
  per-day deltas, not 30× the tenant size. Critical on R2's 10 GB free
  tier.
- **Client-side AES-256 encryption**: R2 sees opaque chunks. Even if the
  R2 API token leaks, attackers see no readable data.
- **Atomic snapshots + point-in-time restore** by snapshot ID.
- **Single static binary**, native to Ubuntu apt repo.

## Why Cloudflare R2

| | R2 | B2 | GDrive |
|---|---|---|---|
| Free storage | 10 GB | 10 GB | 15 GB |
| Egress on restore | **FREE** | 1 GB/day cap | Quotas |
| S3-compatible API | ✅ | ✅ | ❌ (OAuth dance) |
| Past-free cost | $0.015/GB·mo | $0.005/GB·mo | – |

Egress-free restores is the decisive feature: pulling 5 GB back on R2 is
free; on GDrive it can hit per-day caps right when you need it.

## Pipeline

```
03:00 BRT (06:00 UTC) daily
  └─ picoclaw-r2-backup.timer fires
     └─ picoclaw-r2-backup.service runs picoclaw-r2-backup.sh
        ├─ load creds from /etc/picoclaw/r2-backup.env (chmod 600)
        ├─ flock to prevent overlap
        ├─ restic init (first run only)
        ├─ pg_dumpall -> /var/lib/picoclaw-pg-dumps/
        ├─ restic backup /srv/saas/tenants /srv/picoclaw/jotaduo-wa /etc/picoclaw /var/lib/picoclaw-pg-dumps
        │     --tag daily
        │     --exclude transient (*.tmp, *.lock, *-wal, *-shm, *-journal, .cache, runtime-user-env)
        ├─ restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
        └─ restic check --read-data-subset=10%   (light integrity)
```

## What is NEVER backed up

- Source code (`/srv/saas/picoclaw/`) — `git clone` recovers it.
- Workspace templates (`/srv/saas/picoclaw-workspaces/` if present) —
  versioned in repo, re-deployable via CI.
- Docker images — rebuilt by CI from source.
- Postgres data (`/srv/saas/postgres/data/`) — restored from the logical
  `pg_dumpall` snapshots in `/var/lib/picoclaw-pg-dumps/`, not by file-copying
  the live data dir.
- Backups directory itself (`/srv/saas/backups/` if any) — would be
  recursive.

## One-time bootstrap on the VPS

```bash
ssh root@155.138.210.187
cd /tmp && rm -rf picoclaw-bootstrap
git clone --depth 1 https://github.com/devjotaduo/picoclaw.git picoclaw-bootstrap
sudo bash picoclaw-bootstrap/scripts/backups/install.sh
```

The installer:
- Installs `restic` from apt if missing.
- Creates `/etc/picoclaw/` (chmod 700) and seeds `r2-backup.env` from
  the template (chmod 600).
- Creates `/srv/picoclaw/jotaduo-wa/` so the WhatsApp sidecar store can be
  snapshotted even before first pairing.
- Installs `/usr/local/bin/picoclaw-r2-backup.sh` and the systemd units.
- Enables (but does not yet trigger) the daily timer.

You then edit `/etc/picoclaw/r2-backup.env` with the 5 values (see
[r2-backup.env.example](../../scripts/backups/r2-backup.env.example)):

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT` (format: `https://<account-id>.r2.cloudflarestorage.com`)
- `R2_BUCKET`
- `RESTIC_PASSWORD` — **store separately in a password manager**.
  Losing it makes every snapshot cryptographically unreadable. There
  is no recovery.

Then force a first run to validate end-to-end:

```bash
systemctl start picoclaw-r2-backup.service
journalctl -u picoclaw-r2-backup.service -f
```

The first backup is a full upload of tenant volumes, Jotaduo WhatsApp sidecar
state, operator config, and Postgres dumps. Plan for it to take longer than
steady-state daily runs.

## Operations

```bash
# Watch backup log live
journalctl -u picoclaw-r2-backup.service -f

# Last 200 lines from any backup run
journalctl -u picoclaw-r2-backup.service -n 200 --no-pager

# Force a backup now (don't wait for the timer)
systemctl start picoclaw-r2-backup.service

# Pause backups (resume with `systemctl start ...timer`)
systemctl stop picoclaw-r2-backup.timer

# Disable permanently
systemctl disable picoclaw-r2-backup.timer

# Inspect snapshots (requires env loaded)
set -a; source /etc/picoclaw/r2-backup.env; set +a
export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

restic snapshots                       # list snapshots
restic stats                           # repo size
restic stats --mode raw-data           # before-dedup size
restic check                           # full integrity (slow)
restic check --read-data-subset=10%    # sampled (fast)
```

## Restore a single tenant from a specific date

```bash
# Load creds (same as above)
set -a; source /etc/picoclaw/r2-backup.env; set +a
export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

# 1. Find the snapshot you want.
restic snapshots

# 2. Restore JUST that tenant's subdir to /tmp first (NOT directly back
#    on top of the live data — verify first).
restic restore <snapshot-id> \
    --target /tmp/restore \
    --include /srv/saas/tenants/<tenant-id>

# 3. Inspect contents at /tmp/restore/srv/saas/tenants/<tenant-id>/

# 4. Stop the tenant container, swap data dirs, restart.
docker stop tenant-<tenant-id>
mv /srv/saas/tenants/<tenant-id>{,.broken-$(date +%s)}
mv /tmp/restore/srv/saas/tenants/<tenant-id> /srv/saas/tenants/<tenant-id>
docker start tenant-<tenant-id>
```

The two-step (restore-then-swap) is deliberate: restic's `--target /`
would overwrite live tenant state immediately. Restoring to `/tmp` first
lets you sanity-check before committing.

## Restore Jotaduo WhatsApp sidecar state

Use this when `jotaduo-wa` lost pairing or routing state. Restore to a temp
directory first; do not overlay the live directory blindly.

```bash
set -a; source /etc/picoclaw/r2-backup.env; set +a
export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

restic snapshots --path /srv/picoclaw/jotaduo-wa
restic restore <snapshot-id> \
    --target /tmp/restore-jotaduo-wa \
    --include /srv/picoclaw/jotaduo-wa

find /tmp/restore-jotaduo-wa/srv/picoclaw/jotaduo-wa -maxdepth 3 -type f

docker stop jotaduo-wa
mv /srv/picoclaw/jotaduo-wa "/srv/picoclaw/jotaduo-wa.broken-$(date +%s)"
mv /tmp/restore-jotaduo-wa/srv/picoclaw/jotaduo-wa /srv/picoclaw/jotaduo-wa
docker start jotaduo-wa
docker exec jotaduo-wa wget -qO- http://127.0.0.1:18810/readyz
```

Expected key files after restore:

- `/srv/picoclaw/jotaduo-wa/whatsapp/store.db`
- `/srv/picoclaw/jotaduo-wa/routing.db`

## Tuning

The default retention (7 daily + 4 weekly + 6 monthly = ~14 cópias) is
sized for the 10 GB R2 free tier on a small SaaS. To tighten or relax:

```bash
sudo systemctl edit picoclaw-r2-backup.service
# Override e.g.:
#   [Service]
#   Environment=PICOCLAW_RESTIC_KEEP_DAILY=14
#   Environment=PICOCLAW_RESTIC_KEEP_WEEKLY=8
#   Environment=PICOCLAW_RESTIC_KEEP_MONTHLY=12
```

(The script honors these via env, see source.)

## Failure modes

| Failure | Behaviour |
|---|---|
| R2 credentials invalid / revoked | Script logs auth error and exits 1. Timer retries tomorrow. No data lost (live data untouched). |
| Network outage during upload | Restic resumes on next run from last pack file. |
| Restic passphrase lost | **Catastrophic.** All snapshots unreadable. There is no recovery — store the passphrase outside the VPS. |
| Repository corruption | `restic check` flags it. `restic prune --repair` recovers most cases; worst case you re-init and lose history. |
| Free tier exceeded (>10 GB) | Backup keeps running but R2 charges $0.015/GB·month. The script logs a WARN when repo exceeds 8 GB raw-data. |
| Cron drift / box asleep | `Persistent=true` makes the timer fire on next boot to catch the missed run. |
| Two backups overlapping | `flock` makes the second a no-op. |

## What this does NOT do

- **No raw Postgres data-dir backup.** Recovery uses the `pg_dumpall` files
  in `/var/lib/picoclaw-pg-dumps/`.
- **No alerting.** Failures land in `journalctl` only. Hook `OnFailure=`
  if you want pager alerts.
- **No multi-region.** R2 buckets are region-bound. Add a second remote
  via `rclone copy` from R2 to another provider for cross-cloud
  durability if needed.
- **No off-VPS passphrase verification.** This script TRUSTS the
  passphrase in `r2-backup.env`. If it ever changes silently, snapshots
  written after the change cannot be decrypted with the old one. Don't
  rotate the passphrase casually — it requires re-encrypting the repo.
