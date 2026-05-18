# SaaS Dev Mode

Use the dev sync script when you changed Go code and want to update running
containers without rebuilding Docker images.

This is the default local development loop for SaaS/controlplane and tenant
work. Prefer this flow whenever someone asks to work in dev mode, and rebuild
Docker images only when Dockerfiles, base image layers, OS packages, image-only
assets, or durable production image validation are involved.

The script builds local binaries into `build/dev/`, copies them into the
running containers with `docker cp`, then restarts only those containers.

## Common Commands

Sync all controlplane and tenant backend binaries:

```bash
make saas-dev-sync
```

Sync only the controlplane:

```bash
make saas-dev-controlplane
```

Sync all tenant launchers:

```bash
make saas-dev-tenants
```

Sync one tenant:

```bash
make saas-dev-tenants TENANTS="demo-f844dc"
```

Rebuild and sync the SaaS admin UI:

```bash
make saas-dev-admin-ui
```

Rebuild and sync the tenant launcher UI:

```bash
make saas-dev-tenant-ui
```

## Notes

- Default Go tags are `goolm,stdjson,whatsapp_native`.
- Existing Docker volumes and tenant data are preserved.
- Recreating containers from the image later will discard these dev-copied
  binaries. Run the full Docker build only when you need a durable image.
- For profile changes in `/srv/saas/controlplane/data/launcher-profiles`, apply
  the profile separately with `picoclaw-tenantctl apply-profile`.

## Host runtime for `ia.jotaduo.com` (out-of-container launcher)

The launcher serving `ia.jotaduo.com` is **not** in a container. It runs from
the working tree via a single persistent systemd unit:

```text
/etc/systemd/system/picoclaw-main-dev.service
```

That unit invokes `pnpm --dir web/frontend dev:api` which spawns Vite (HMR for
the SPA) plus a Go `go run` of `web/backend` listening on :18800. Reverse
proxy is OpenResty container `1Panel-openresty-hz6g` →
`127.0.0.1:18800`.

Workflow:

- Frontend (`web/frontend/src/**`): just save — Vite HMR reloads the browser,
  the service stays up. This only works because the unit sets
  `PICOCLAW_VITE_DEV_URL=http://127.0.0.1:5194`: the Go launcher checks that
  env at startup (`web/backend/embed.go`) and, when present, reverse-proxies
  `/`, `/assets/*`, `/@vite/*`, `/src/*`, `/node_modules/*` to the Vite dev
  server instead of the embedded `//go:embed all:dist` bundle. Unset it (or
  remove it from the unit) to fall back to serving the embedded production
  build — useful for testing what the deployed binary actually ships.
- Backend Go (`internal/**`, `web/backend/**`, `pkg/**`): edit, then
  `systemctl restart picoclaw-main-dev.service` (≈30 s rebuild). Logs:
  `journalctl -u picoclaw-main-dev.service -f`.
- SaaS controlplane changes (in container): `make saas-dev-controlplane`.

There is no parallel "prod" unit anymore — the previous
`picoclaw-launcher.service` pointing to `/usr/local/bin/picoclaw-launcher` was
removed in 2026-05-18 to avoid two binaries fighting over :18800. When a
durable image install is needed later, do it explicitly (rebuild the binary,
copy to `/usr/local/bin/`, swap the unit `ExecStart`) — never run both at the
same time.
