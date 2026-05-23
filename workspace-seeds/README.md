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

## Stage atual: auto-sync no deploy ✓

O `scripts/auto-deploy/picoclaw-deploy.sh` (rodado a cada 2 min pelo
`picoclaw-deploy.timer`) sincroniza este diretório com
`/srv/picoclaw-workspaces/` antes de qualquer rebuild de container.

**Modelo de propriedade via marker file `.seed-managed`:**

- **Primeira sincronização** (target ausente): cria
  `/srv/picoclaw-workspaces/<slug>/home/` + popula com o conteúdo do seed
  + escreve `.seed-managed` com o sha256 do seed.
- **Sync subsequente** (target tem `.seed-managed`): se o sha256 mudou,
  faz `rsync -a --delete` (preservando o marker, sessions/, *.db etc.) e
  atualiza o sha. Idempotente quando nada mudou.
- **Workspace "reclamada" pelo admin** (admin deletou o
  `.seed-managed`): o auto-deploy nunca mais toca ali. Admin assume
  responsabilidade total daquela workspace.

Por padrão, **tenants existentes NÃO recriam** seus volumes — eles
continuam com o snapshot que receberam no provision original. Só
provisions NOVAS (após a sincronização) ganham o template atualizado.

**Para forçar um tenant a receber template novo:**
```bash
# Na VPS:
docker stop tenant-<id>
docker rm tenant-<id>
# admin reprovisiona via painel (a workspace template já está atualizada)
```

**Para "destacar" uma workspace do Git** e editar livremente pelo painel:
```bash
rm /srv/picoclaw-workspaces/<slug>/home/.seed-managed
```

## Próximo: stage 3 (upload via API GitHub Actions)

Workflow GitHub Actions que zipa `workspace-seeds/<slug>/home/` e bate em
`POST /api/v1/workspaces/upload` com bearer admin token. Cria uma nova
workspace row na DB (com nome versionado tipo `default-v2`); admin decide
quando promover para `is_default_auto`. Útil quando o admin quer
versionamento por release sem auto-overwrite.
