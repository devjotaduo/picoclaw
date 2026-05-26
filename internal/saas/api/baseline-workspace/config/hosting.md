# Hospedagem de sites simples

Usado por `skills/marketing/publicar-site-simples/SKILL.md`.

## Provedor configurado
- [ATUALIZAR — ex: Cloudflare Pages | Netlify | GitHub Pages | Vercel | servidor próprio]

## Domínio público base
- [ATUALIZAR — ex: https://campanhas.suaempresa.com.br]

## Caminho para novos sites
- Estrutura: `https://<dominio-publico>/<slug>/`
- Exemplo: `https://campanhas.suaempresa.com.br/maes-2026/`

## Credenciais
- **NÃO** colocar credenciais aqui.
- Guardar em gerenciador de segredos (1Password, Bitwarden, .env não versionado).
- Referência do segredo: [ATUALIZAR — ex: vault/marketing/hosting]

## Política de despublicação
- Todo site com campanha tem `expira_em` em `memory/marketing.md`.
- Lia avisa 3 dias antes do vencimento.
- Após aprovação, mover para `workspace/output/sites/_arquivados/<slug>-YYYYMMDD/`.

## Limites
- Tamanho máximo por site: 5 MB.
- Sem coleta de dados sem consentimento (LGPD — ver `config/privacy-policy.md`).
- SSL obrigatório (https).
