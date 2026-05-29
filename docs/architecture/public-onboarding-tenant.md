# Public Tenant Onboarding

A public onboarding tenant is a normal Picoclaw tenant marked
`is_public=true`. It is created through the admin "New tenant" wizard with
tenant type **Público**. Visitors open the tenant subdomain and talk to
**Sofia** in the same launcher chat used by every tenant: `/pico/ws`.

The standalone public intake and the old public SSE chat path are legacy.
Do not build new product flows on them.

## Canonical Flow

```
Admin
  -> adm.<base>/tenants/new
  -> selects tenant_type=publico
  -> creates an is_public=true tenant with active_profile=public

Visitor
  -> https://<public-subdomain>.<base>/
  -> launcher SPA loads the public profile
  -> controlplane signs the minimal anonymous tenant routes
  -> browser connects to /pico/ws
  -> Sofia runs the discovery flow

Sofia
  -> captures owner name, email and WhatsApp
  -> updates workspace/state/onboarding.json through onboarding-state
  -> writes the company memory

Catarina
  -> is triggered by the workspace bridge cron when discovery is complete
  -> sends deepening questions through the institutional Jotaduo WhatsApp

Admin
  -> reviews the onboarding state
  -> promotes the public tenant to a normal customer tenant
```

## Public Tenant HTTP Surface

Public tenants do not expose the dashboard. The anonymous surface is only the
minimum required to render Sofia and exchange chat messages:

- `GET /`, `GET /index.html`, frontend assets and icons.
- `GET /api/auth/status`.
- `GET /api/launcher/ui-visibility`.
- `GET /api/launcher/policy`.
- `GET /api/gateway/status`.
- `GET /pico/ws` with WebSocket upgrade.

All other dashboard APIs stay behind normal tenant auth. In particular, the
public browser must not call `/api/models`, `/api/internal-agents`,
`/api/sessions` or agent dashboard APIs.

## Provisioning Contract

For `is_public=true` tenants:

- `PICOCLAW_AUTH_MODE=trusted_gateway`.
- `PICOCLAW_PUBLIC_TENANT=true`.
- `PICOCLAW_ALLOWED_CHANNELS=whatsapp_native,pico`.
- `JOTADUO_WA_URL` and `JOTADUO_WA_HMAC_SECRET` are injected only when the
  institutional WhatsApp sidecar is configured.
- `workspace/AGENT.md` is overwritten with Sofia discovery mode and the
  customer prompt is preserved as `workspace/AGENT.cliente.md`.
- `ui-visibility.json` is set to `active_profile=public`.

When the admin promotes the tenant, the container is recreated without the
public marker and without the institutional WhatsApp secret.

## Verification

After creating a public tenant:

```bash
curl -sS https://<public-subdomain>.<base>/api/launcher/ui-visibility
# active_profile must be "public"

curl -i -N --http1.1 \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H 'Sec-WebSocket-Version: 13' \
  https://<public-subdomain>.<base>/pico/ws
# expected: 101 Switching Protocols
```

Then validate in a browser that `/` stays on the tenant root, shows Sofia, and
does not redirect to `/launcher-login`.

## References

- [public-tenant-promotion.md](./public-tenant-promotion.md) - full product
  journey and promotion mechanics.
- [jotaduo-wa-sidecar.md](./jotaduo-wa-sidecar.md) - institutional WhatsApp
  sidecar used by Catarina.
- [workspaces.md](./workspaces.md) - workspace materialization into tenant
  volumes.
