# Configuração de Hosting

## Servidor de publicação estática

provider: local
base_url: http://localhost:18800
public_path: public/marketing
output_path: workspace/output/marketing

## Mapeamento de URL público

Arquivos salvos em `public/marketing/<slug>/index.html` ficam acessíveis em:
`http://localhost:18800/public/marketing/<slug>/`

Arquivos salvos em `public/marketing/<slug>.html` ficam acessíveis em:
`http://localhost:18800/public/marketing/<slug>.html`

Imagens em `public/marketing/<slug>.png` ficam acessíveis em:
`http://localhost:18800/public/marketing/<slug>.png`

## HTTPS em produção

Em produção (picoclaw-launcher via Traefik), substituir base_url por:
`https://<tenant>.jotaduo.com`

## QR code

Gerar QR a partir da URL pública com a ferramenta disponível.
Salvar em `workspace/output/sites/<slug>/qr.png`.

## Expiração

Sites de campanha: 30 dias por padrão.
Definir `expira_em: YYYY-MM-DD` no registro de `memory/marketing.md`.
