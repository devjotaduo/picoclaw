# opencrm — picoclaw-saas-vendored fork

Self-hosted Node fork of [clawnify/open-crm](https://github.com/clawnify/open-crm),
embedded into picoclaw-saas as the operator's CRM (companies, contacts, deals
pipeline). Reverse-proxied behind the controlplane's admin auth — never
exposed to tenants or the public internet.

## Upstream baseline

Vendored at commit **`0f57bb6518f11b208282b7f9ea7d2731696307d6`**
(see `git log -1 --format=%H upstream/main` to compare).

## Divergences from upstream

| File | Change | Reason |
|---|---|---|
| `src/server/db.ts` | Rewritten on top of `better-sqlite3` | Upstream targets Cloudflare D1; we self-host on the picoclaw-saas VPS |
| `src/server/server.ts` | **New** — Node entrypoint via `@hono/node-server`, applies `schema.sql` at boot, serves built Preact client + SPA fallback | Upstream relies on `wrangler dev` (Workers runtime) |
| `src/server/index.ts` | `type Env = { Bindings: { DB?: unknown } }` (was `D1Database`) | Lets the Hono app compile without `@cloudflare/workers-types`; `initDB` is idempotent and tolerates the now-undefined per-request value |
| `src/client/api.ts` | `fetch(path)` → `fetch(BASE + path)` where `BASE = import.meta.env.BASE_URL` (stripped of trailing slash) | App is served behind the controlplane reverse proxy at `/crm/`; all API calls must be prefixed |
| `vite.config.ts` | `base: "/crm/"` | Asset URLs in the built HTML are prefixed so the proxy can route them |
| `package.json` | Adds `@hono/node-server`, `better-sqlite3`, `@types/better-sqlite3`; replaces `wrangler` scripts with `build`/`start` | Node toolchain instead of Wrangler |
| `tsconfig.server.json` | **New** | Separate server-build config (ES module output, `dist-server/`) |
| `Dockerfile` | **New** | Multi-stage build → distroless-ish runtime image |

`tsconfig.json`, the rest of `src/client/`, `index.html`, `manifest.json`,
`icon.svg`, and `src/server/schema.sql` are untouched.

## Rebase upstream

```sh
cd /tmp && git clone https://github.com/clawnify/open-crm
# diff upstream against this fork:
diff -ru /tmp/open-crm/src docker/saas/opencrm/src
# bump the commit hash above + reapply the divergences listed.
```

## Runtime layout (inside the container)

```
/app
├── dist/            built Preact client (served as static + SPA fallback)
├── dist-server/     compiled Node server
│   └── server/server.js  ← entrypoint
├── schema.sql       applied at every boot (CREATE TABLE IF NOT EXISTS …)
└── node_modules/

/data
└── opencrm.db       SQLite (host bind: /srv/saas/opencrm/data)
```

## Env vars

| Var | Default |
|---|---|
| `OPENCRM_DB_PATH` | `/data/opencrm.db` |
| `OPENCRM_PORT` | `8787` |
| `OPENCRM_STATIC_ROOT` | `/app/dist` |
| `OPENCRM_SCHEMA_PATH` | `/app/schema.sql` |
