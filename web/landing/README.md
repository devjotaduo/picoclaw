# jotaduo.com landing

Static React landing page served at the apex domain `jotaduo.com`.

## Workflow padrão: push → auto-deploy

A landing é **bakeada na imagem do controlplane** em CI/CD (ver
`docker/saas/Dockerfile` stage 1b → `/var/lib/picoclaw-landing/`).
Toda edição segue o fluxo normal de deploy:

```bash
# edita
cd web/landing
$EDITOR src/App.tsx

# build local opcional pra preview (não obrigatório):
pnpm install   # 1x
pnpm dev       # http://localhost:5176

# commit + push
git add web/landing/
git commit -m "landing: <descrição>"
git push origin main
```

Após o push:
1. GitHub Actions builda a imagem `ghcr.io/devjotaduo/picoclaw-saas:main`
   (rebuilda o stage `landing` quando `web/landing/` mudou)
2. `picoclaw-deploy.timer` na VPS pulla nova imagem (≤ 2 min)
3. Container `controlplane` é recriado com o novo landing dist em
   `/var/lib/picoclaw-landing/`
4. `https://jotaduo.com` mostra a nova versão (Cache-Control: no-store
   no `index.html` garante refresh imediato)

Total push → live: ~3-5 min.

## Hot-fix sem rebuild (escape hatch)

Quando precisa testar uma mudança visual rápida sem esperar CI:

```bash
# 1. Build local
cd web/landing
pnpm build

# 2. Cria docker-compose.override.yml na VPS:
#    services:
#      controlplane:
#        volumes:
#          - /var/lib/picoclaw-landing:/var/lib/picoclaw-landing:ro
#    (uma vez só)

# 3. Garante dir existe:
ssh root@vps 'mkdir -p /var/lib/picoclaw-landing'

# 4. Upload do dist (o bind-mount sobrescreve o conteúdo bakeado):
scp -r dist/* root@155.138.210.187:/var/lib/picoclaw-landing/

# 5. Para voltar ao fluxo de CI: rm o override e re-deploy.
```

## What gets shown for which host

| Host | Served from | Edit via |
|---|---|---|
| `jotaduo.com` (apex) | `/var/lib/picoclaw-landing/` (image-baked) | edit `web/landing/` + push |
| `admin.jotaduo.com` / `adm.jotaduo.com` | embedded SPA in controlplane | edit `web/saas-admin/` + push |
| `<tenant>.jotaduo.com` | tenant container (proxied) | tenant's own launcher |

Se o dir `/var/lib/picoclaw-landing/` estiver vazio (não deve acontecer
com a imagem oficial), o apex cai pro SPA admin como fallback seguro
(`LandingMux` em `internal/saas/api/spa.go`).

## Stack

- Vite 7 + React 19 + TypeScript + Tailwind v4
- Sem router (single-page)
- Sem state management
- ~70 KB total gzipado (CSS + JS)

## Customizing copy

`src/App.tsx` segura a página inteira (Hero / Features / Steps / CallToAction / Footer).
Constantes no topo (`ADMIN_URL`, `SUPPORT_EMAIL`) repintam CTAs.

SEO meta tags em `index.html`.

## Brand

- Verde primário: `#15803d` (igual ao dos templates de email transacionais
  e ao `--color-brand-500` em `src/index.css`)
- Logo: SVG `J` em gradient verde (inline em `Logo` + `public/favicon.svg`)
- Font: ui-sans-serif stack (zero dependência de web font)
