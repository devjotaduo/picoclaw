# Configuração de Hosting

## Variável de ambiente principal

```
PICOCLAW_PUBLIC_BASE_URL=https://<tenant>.jotaduo.com
```

Setada pelo controlplane SaaS ao provisionar o tenant. Quando presente, o
launcher usa esse valor para montar URLs absolutas em todos os assets
de marketing gerados pela Lia.

Sem a variável (dev standalone), os links são relativos ao próprio launcher:
`/public/marketing/<slug>.html`

## Pasta de publicação dentro do workspace

```
$PICOCLAW_HOME/workspace/public/marketing/
```

O launcher serve essa pasta em `GET /public/marketing/{asset}` com:
- Path traversal bloqueado
- Extensões permitidas: .html .htm .css .js .json .png .jpg .jpeg .webp .gif .svg .pdf
- Cache-Control: public, max-age=300

## API para montar links

```
GET /api/marketing/public-base-url
→ {
    "base_url":    "https://minhaclinica.jotaduo.com",
    "publish_dir": "/root/.picoclaw/workspace/public/marketing",
    "example":     "https://minhaclinica.jotaduo.com/public/marketing/promo.html"
  }
```

Quando `PICOCLAW_PUBLIC_BASE_URL` não está setado, `base_url` retorna vazio e
a Lia deve usar o caminho relativo como fallback.

## Estrutura de pastas esperada

```
workspace/
  public/
    marketing/
      bella-vida-catalogo.html
      bella-vida-promo-maio.html
      2026-05-22/
        post-bella-vida-promo-og.png
      _arquivados/              ← sites expirados movidos aqui
        bella-vida-promo-abril-20260430/
```

## SaaS (produção)

- Traefik roteia `https://<slug>.jotaduo.com` → container `picoclaw-launcher`
- Container tem `PICOCLAW_PUBLIC_BASE_URL=https://<slug>.jotaduo.com` no env
- `workspace/public/marketing/` é um volume bind-mounted do host

## Dev / standalone

- Deixar `PICOCLAW_PUBLIC_BASE_URL` vazio
- Acesso via `http://localhost:18800/public/marketing/<asset>`
