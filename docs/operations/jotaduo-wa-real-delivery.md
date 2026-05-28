# Jotaduo WA real delivery runbook

This runbook documents the 2026-05-28 real WhatsApp validation for the
Sofia -> Catarina -> `jotaduo-wa` flow and the production fixes that made
the send path reliable.

Use it when a public tenant reports that Catarina sent a WhatsApp message
but the lead did not receive it, or when validating a new `jotaduo-wa`
image in production.

## Scope

- Repo/worktree: `C:\Users\ruthe\Pictures\pico2\picoclaw`
- Branch used during the incident: `codex/fix-public-tenant-e2e`
- Production host alias: `pico` (`hostname` returned `vultr`)
- Sidecar container: `jotaduo-wa`
- Public tenant used for validation: `padaria-teste-sofia-fbf29a`
- Real lead phone numbers are intentionally masked in docs. Keep full
  numbers out of commits, logs pasted into issues, and memory notes unless
  there is an operational reason to expose them.

## End-to-end checkpoints

The flow has two independent validation layers.

1. Mock E2E before real WhatsApp:
   - Sofia discovery produced tenant state.
   - Catarina deepening started from the public tenant state.
   - `catarina-inbox-flow` read signed inbound messages from
     `workspace/state/jotaduo-wa-inbox.jsonl`.
   - The inbox pointer advanced and Catarina sent the next deepening
     question.
2. Real WhatsApp:
   - Tenant skill `enviar-whatsapp-jotaduo` signed `/internal/wa/send`.
   - Sidecar registered `phone -> tenant_id` in `routing.db`.
   - `whatsapp_native` returned a real WhatsApp message ID.
   - `docker logs jotaduo-wa` showed no post-send `privacy token`
     error after the final fix.

## Incident symptoms

Initial real sends returned HTTP 200 from the sidecar, but delivery was not
reliable.

Observed responses and logs:

- First production sends returned `{"status":"sent","message_ids":null,...}`.
- After returning IDs, sends returned IDs such as `3EB05B17E660B5996B60CF`
  but still logged:

```text
Server returned different participant list hash (...) when sending to ...@s.whatsapp.net.
Failed to issue privacy token for ...@s.whatsapp.net: info query returned status 400: bad-request
```

Important discovery:

- The paired WhatsApp account in `store.db` had a PN JID and a LID, but
  `lid_migration_ts=0`.
- One tested number was the same phone as the paired account with the
  Brazilian ninth digit variant. That must be rejected as self-send, not
  treated as a valid lead outreach.

## Root cause

There were three related gaps in the native WhatsApp channel:

1. `sendWithSource` discarded the generated WhatsApp message ID in the
   successful path, so the sidecar could report `message_ids:null`.
2. The channel did not reject sends to the paired WhatsApp account,
   including Brazilian ninth-digit variants.
3. The channel sent directly to the raw PN JID without recipient preflight.
   In the production session, this produced WhatsApp privacy-token errors
   after the HTTP path had already returned success.

The effective fix was to:

- return the generated/acknowledged WhatsApp message ID;
- reject self-sends before calling `SendMessage`;
- validate phone recipients with `IsOnWhatsApp`;
- canonicalize legacy JIDs returned by WhatsApp;
- resolve PN -> LID when the paired account has a LID;
- apply the same self-send protection to media sends.

## Fix commits

Relevant commits on `codex/fix-public-tenant-e2e`:

- `150e9165 fix(whatsapp): detect self sends in native channel`
- `c76912f2 fix(whatsapp): resolve LID before native sends`
- `16aebf6 fix(whatsapp): verify native recipients before send`

The final deployed production sidecar image after this run was:

```text
sha256:b59314a8e4b0150b348098df50f55af55d5d412ee8822582dd95a1fc928f4cf6
```

## Local validation

Run the focused WhatsApp tests:

```bash
go test -tags "goolm stdjson whatsapp_native" ./internal/jotaduowa ./pkg/channels/whatsapp_native
```

Use the project finish script to vet, commit, and push only the touched
WhatsApp files:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/agent-finish.sh `
  --message "fix(whatsapp): verify native recipients before send" `
  --body "Validate phone recipients with IsOnWhatsApp before native sends, canonicalize legacy JIDs, and keep LID resolution after recipient verification." `
  --scope pkg/channels/whatsapp_native/whatsapp_native.go `
          pkg/channels/whatsapp_native/whatsapp_phone_test.go
```

On Windows, plain `bash scripts/agent-finish.sh` may hit WSL `/bin/bash`
problems. Use Git Bash explicitly as above.

## Official production deploy path

Do not copy binaries, source code, or hand-built images to the VPS. Production
deploys go through `.github/workflows/release-controlplane.yml` and the VPS
pulls images through `picoclaw-deploy.service`.

Trigger the workflow against the branch with the fix:

```bash
gh workflow run release-controlplane.yml \
  --ref codex/fix-public-tenant-e2e \
  -R devjotaduo/picoclaw
```

Watch the run:

```bash
gh run watch <run-id> --exit-status -R devjotaduo/picoclaw
```

The 2026-05-28 validation used these successful run IDs:

- `26599988812`
- `26600641561`

Force the VPS to pull and recreate changed central services:

```bash
ssh pico 'sudo systemctl start picoclaw-deploy.service && sleep 8 && journalctl -u picoclaw-deploy.service -n 90 --no-pager'
```

Expected evidence when `jotaduo-wa` changes:

```text
jotaduo-wa image changed:
  running <old-sha>...
  pulled  <new-sha>...
recreating jotaduo-wa via docker compose
deploy complete - status=running health=healthy
```

## Production readiness checks

Check the sidecar container and readiness endpoint:

```bash
ssh pico 'docker inspect jotaduo-wa --format "{{.Image}} {{.State.Health.Status}}"; docker exec jotaduo-wa wget -qO- http://127.0.0.1:18810/readyz'
```

Expected:

```text
sha256:<image-id> healthy
{"status":"ok"}
```

Check the paired device state without printing secrets:

```bash
ssh pico 'docker cp jotaduo-wa:/var/lib/jotaduo-wa/whatsapp/store.db /tmp/jotaduo-store.db >/dev/null'
ssh pico 'python3 - <<PY
import sqlite3
conn=sqlite3.connect("/tmp/jotaduo-store.db")
for row in conn.execute("select jid,lid,lid_migration_ts from whatsmeow_device"):
    print(row)
PY'
```

If a target is suspected of being the paired account under a Brazilian
ninth-digit variant, do not send. Use a different recipient.

## Real-send command

Run the send from a public tenant that has the sidecar env vars:

```bash
ssh pico 'docker exec tenant-padaria-teste-sofia-fbf29a python3 /root/.picoclaw/workspace/skills/enviar-whatsapp-jotaduo/scripts/send.py <phone> "<message>"'
```

Successful technical validation after the final fix:

```json
{"message_ids":["3EB092D21A0A1073793AEF"],"status":"sent","tenant_id":"padaria-teste-sofia-fbf29a"}
```

Successful Catarina deepening message after the final fix:

```json
{"message_ids":["3EB022DB35CE982BD2CE8C"],"status":"sent","tenant_id":"padaria-teste-sofia-fbf29a"}
```

After sending, inspect recent logs:

```bash
ssh pico 'docker logs --since 2m jotaduo-wa 2>&1 | tail -160'
```

For this fix, the important negative evidence is absence of:

```text
Failed to issue privacy token
Server returned different participant list hash
```

## Routing evidence

The sidecar auto-registers the route when a send succeeds. Query routes via
the tenant HMAC env without printing the secret:

```bash
cat <<'PY' | ssh pico 'docker exec -i tenant-padaria-teste-sofia-fbf29a python3 -'
import hashlib, hmac, os, urllib.request
url = os.environ.get("JOTADUO_WA_URL", "").rstrip("/")
secret = os.environ.get("JOTADUO_WA_HMAC_SECRET", "")
tenant = os.environ.get("PICOCLAW_TENANT_ID", "")
body = b""
sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
req = urllib.request.Request(
    f"{url}/internal/wa/routing/by-tenant/{tenant}",
    method="GET",
    headers={"X-Jotaduo-WA-Signature": sig},
)
with urllib.request.urlopen(req, timeout=10) as r:
    print(r.read().decode())
PY
```

Expected: target phone appears under `routes` with the current public
tenant ID.

## Caveats

- A WhatsApp message ID proves the sidecar accepted and WhatsApp acked the
  send request. It does not prove the user read the message.
- Do not expose full lead phone numbers in docs. Use masked values.
- Do not print `JOTADUO_WA_HMAC_SECRET` or admin tokens.
- Re-pairing remains a separate operational issue documented in
  [jotaduo-wa-sidecar.md](../architecture/jotaduo-wa-sidecar.md).
