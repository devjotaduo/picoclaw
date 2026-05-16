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
