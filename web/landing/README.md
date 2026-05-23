# jotaduo.com landing

Static React landing page served at the apex domain `jotaduo.com`.

## Architecture

- **Source**: this directory (`web/landing/`) — Vite + React 19 + Tailwind v4
- **Build output**: `dist/` — **gitignored**, built locally
- **Production serving**: controlplane reads from `/var/lib/picoclaw-landing/`
  on the VPS and serves it for requests with `Host: jotaduo.com`. Other
  hosts (`admin.*`, `<tenant>.*`) continue to serve the SPA admin embedded
  in the controlplane binary. See `internal/saas/api/spa.go`
  (`LandingMux`) and `docker-compose.prod.yml` (bind-mount).

The landing is intentionally NOT embedded in the Go binary so you can
iterate (edit -> build -> rsync) without rebuilding/redeploying the
controlplane container.

## Workflow

### Local dev

```bash
cd web/landing
pnpm install     # first time only
pnpm dev         # http://localhost:5176
```

### Build + deploy to VPS

```bash
cd web/landing
pnpm build       # writes dist/

# upload to the bind-mounted dir on the VPS:
scp -r dist/* root@155.138.210.187:/var/lib/picoclaw-landing/

# no container restart needed — controlplane reads from disk on each request
# (with Cache-Control: no-store on index.html for instant refresh)
```

First-time VPS setup (the directory must exist before scp works):

```bash
ssh root@155.138.210.187 'mkdir -p /var/lib/picoclaw-landing && chmod 755 /var/lib/picoclaw-landing'
```

## What gets shown for which host

| Host | Served from | Editable how |
|---|---|---|
| `jotaduo.com` (apex) | `/var/lib/picoclaw-landing/` | scp this dist/ |
| `admin.jotaduo.com` / `adm.jotaduo.com` | embedded SPA in controlplane | `web/saas-admin/` then controlplane rebuild |
| `<tenant>.jotaduo.com` | tenant container (proxied) | tenant's own launcher |

If `/var/lib/picoclaw-landing/` is empty or has no `index.html`, requests
to the apex fall through to the SPA admin (zero-risk fallback while you
haven't uploaded anything yet).

## Customizing copy

Edit `src/App.tsx`. The single file holds the whole page (Hero / Features
/ Steps / CallToAction / Footer). Constants at the top of the file
(`ADMIN_URL`, `SUPPORT_EMAIL`) make it easy to repoint CTAs.

For SEO meta tags, edit `index.html`.

## Brand

- Primary green: `#15803d` (matches `--color-brand-500` in `src/index.css`
  and the controlplane email templates)
- Logo: SVG `J` on green gradient (defined inline in `src/App.tsx::Logo`
  and as `public/favicon.svg`)
- Font stack: ui-sans-serif fallback (no web font dependency)
