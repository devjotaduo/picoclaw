# Workspace seeds (Git-versioned tenant templates)

Cada subdiretório aqui é um **template de workspace** versionado em Git.
A intenção é que esses templates sejam a baseline a partir da qual novos
tenants são provisionados na VPS, em vez do conteúdo ser editado só pelo
painel admin em `/srv/picoclaw-workspaces/`.

## Layout

```
workspace-seeds/
└── <slug>/
    ├── README.md              ← descreve o template (público-alvo, tom, etc.)
    └── home/                  ← vira /root/.picoclaw dentro do tenant
        ├── AGENT.md, SOUL.md  ← agente principal (editado à mão por template)
        ├── .security.yml      ← política de segurança (à mão)
        ├── config.json        ← com placeholders ${LITELLM_KEY}/${TENANT_ID} (à mão)
        └── workspace/         ← memória, skills, sub-agentes
            ├── agents/        ← GERADO via sync (não editar aqui)
            └── skills/        ← GERADO via sync (não editar aqui)
```

`home/` é exatamente o que `tenant.CopyWorkspaceHome` espera — o
provisionador copia o subtree inteiro para o volume do tenant, depois
substitui placeholders e adiciona a key LiteLLM gerada.

## Fonte da verdade dos arquivos compartilhados

Os arquivos em `<slug>/home/workspace/agents/` e `<slug>/home/workspace/skills/`
**não são editados aqui**. A fonte da verdade é `workspace/` na raiz do
repo (que é o seed do launcher dev). O script
`scripts/sync-workspace-seeds.sh` copia os diretórios listados nele
(`THIN_ROUTER_AGENTS` + `SHARED_SKILLS`) para todos os seeds, removendo
runtime state (`memory/`, `sessions/`, `*.db`, etc.).

```bash
# Após editar workspace/agents/pixel/AGENT.md ou
# workspace/skills/cli-delegation/SKILL.md:
make sync-seeds          # ou: scripts/sync-workspace-seeds.sh --apply

# Antes de commitar (e em CI):
make check-seeds         # falha se workspace-seeds está dessincronizado
```

`make check-seeds` é parte de `make check`, então PRs com seeds
dessincronizados quebram o pre-PR.

Arquivos NÃO-gerados (`AGENT.md`/`SOUL.md` raiz, `config.json`,
`.security.yml`) são editados à mão por template — eles definem a
personalidade do template, não infra compartilhada.

## Estado atual: stage 1 (versionado, sync manual)

Hoje não há automação de deploy desses seeds para a VPS. O fluxo é
manual:

```bash
# Na VPS, após pull deste repo:
rsync -a --delete workspace-seeds/default/home/ /srv/picoclaw-workspaces/default/home/
```

Workspaces existentes na VPS NÃO são tocadas pelo sync — apenas serve
para criar novas, ou para preparar o conteúdo antes do admin marcar
`is_default_auto=true`.

## Próximo passo: stage 2 (auto-sync no deploy)

Quando o template estabilizar, adicionar passo no
`scripts/auto-deploy/picoclaw-deploy.sh` que compara checksum do diretório
com o que está em `/srv/picoclaw-workspaces/<slug>/home/` e roda o rsync
quando mudou. Tenants existentes seguem intocados — só novos provisions
pegam o template novo.

## Stage 3: upload via API

Workflow GitHub Actions que zipa `workspace-seeds/<slug>/home/` e bate em
`POST /api/v1/workspaces/upload` com bearer admin token. Cria uma nova
workspace row na DB (com nome versionado tipo `default-v2`); admin decide
quando promover para `is_default_auto`.
