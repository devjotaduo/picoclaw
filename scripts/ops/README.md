# scripts/ops

Operational scripts that run on the VPS (not on the build/CI machine).
These are NOT part of any container image — they live on `/usr/local/bin/`
and are wired into `systemd` units. Updates require manual `scp` or
`curl` (see [[project-deploy-pipeline-gotchas]] gotcha #5).

## claude-auth-expiry-check

Daily check that the operator's claude-cli OAuth credentials at
`/etc/picoclaw/claude-auth/.claude/.credentials.json` are still valid.
Audit P1 #32 (gap report 2026-05-27), confirmed live 2026-05-28 when
the funnel was paralyzed for ~6h before anyone noticed an expired token.

### Files

| File | Destination on VPS |
|---|---|
| `claude-auth-expiry-check.sh` | `/usr/local/bin/claude-auth-expiry-check.sh` |
| `claude-auth-expiry-check.service` | `/etc/systemd/system/` |
| `claude-auth-expiry-check.timer` | `/etc/systemd/system/` (fires daily 02:00 UTC) |

### Install

```bash
# On the VPS, after pulling main:
sudo bash scripts/ops/install-claude-auth-monitor.sh
```

Idempotent. The install script also runs a one-shot check + prints the
current status, so the operator sees immediately whether credentials
are OK or about to expire.

### Behavior

- **OK (> 7 days remaining)**: exit 0, status file says `status=ok`.
- **WARN (1-7 days remaining)**: exit 0 (still functional) but status file
  says `status=warn` + journal logs WARN line.
- **EXPIRED (0 hours remaining)**: **exit 1** (systemd marks unit failed)
  + status file `status=expired`. Tenants are CURRENTLY failing LLM calls.
- **MISSING / UNPARSEABLE**: exit 2.

### External monitoring hook

Two options for alerting:

1. **systemd `is-failed` polling**: another cron / external monitor
   stats `systemctl is-failed claude-auth-expiry-check.service`.
2. **Status file**: `cat /var/lib/picoclaw-pg-dumps/.claude-auth-status`
   returns one line `<iso_ts> status=<ok|warn|expired|missing|unparseable> ...`.
   Mtime > 26h = check itself stopped running (timer disabled or service
   crashing).

### Recovery flow when alerted

```bash
# 1. On laptop (NOT the VPS):
claude /login                      # browser OAuth flow

# 2. Copy fresh credentials to VPS:
scp ~/.claude/.credentials.json \
    pico:/etc/picoclaw/claude-auth/.claude/.credentials.json

# 3. Validate:
ssh pico 'docker exec tenant-<id> claude --print "ok"'
# expected: "ok"

# 4. (optional) re-run the check to update status file:
ssh pico 'systemctl start claude-auth-expiry-check.service'
```
