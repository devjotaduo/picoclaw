# codex CLI provider em tenants SaaS — fallback de claude-cli

Mesmo padrão de [claude-cli-provider.md](claude-cli-provider.md), porém
com OpenAI Codex CLI (`codex`) em vez do Claude CLI. Usado primariamente
como **fallback** quando `claude-cli` rate-limita ou expira token.

**Quando faz sentido:**
- Tenant configurado com `provider="claude-cli"` precisa de fallback
  pra continuar funcionando se a subscription Max do operador estourar
  o limite
- Operador tem subscription ChatGPT Plus/Pro pra alimentar o codex

**Não faz sentido:**
- Operador não tem subscription OpenAI ativa
- Tenant que NÃO usa claude-cli (sem necessidade de fallback)

## Setup (uma vez no VPS)

### 1. Criar o diretório de auth no host

```bash
ssh root@<vps>
mkdir -p /etc/picoclaw/codex-auth
chmod 700 /etc/picoclaw/codex-auth
```

### 2. Autenticar codex apontando HOME pra esse diretório

**Atalho recomendado** (se você já usa codex localmente):

```bash
# Linux/Mac:
scp ~/.codex/auth.json root@<vps>:/etc/picoclaw/codex-auth/.codex/auth.json

# Windows PowerShell:
scp $env:USERPROFILE\.codex\auth.json root@<vps>:/etc/picoclaw/codex-auth/.codex/auth.json
```

Depois `chmod 600` no destino. Mesma técnica que funcionou pro claude-cli.

**Alternativa interativa** (OAuth no VPS):

```bash
docker run --rm -it \
  -v /etc/picoclaw/codex-auth:/auth \
  -e HOME=/auth \
  ghcr.io/devjotaduo/picoclaw-launcher:main \
  codex login
```

### 3. Ligar a feature no controlplane

Adicionar em `/srv/saas/picoclaw/.env`:

```bash
PICOCLAW_TENANT_CODEX_CLI_AUTH_DIR=/etc/picoclaw/codex-auth/.codex
```

Recriar o controlplane pra ele ler a env nova:

```bash
docker compose -p picoclaw-saas \
  -f /srv/saas/picoclaw/docker/saas/docker-compose.prod.yml \
  --env-file /srv/saas/picoclaw/.env \
  up -d --force-recreate controlplane
```

### 4. Configurar tenant com fallback chain

No `config.json::model_list`, adicionar uma entrada codex E referenciar
ela no `fallbacks` da entrada primária:

```json
{
  "agents": {"defaults": {"model_name": "default", "provider": "claude-cli"}},
  "model_list": [
    {
      "model_name": "default",
      "provider": "claude-cli",
      "model": "sonnet",
      "workspace": "/root/.picoclaw/workspace",
      "fallbacks": ["codex-fallback"]
    },
    {
      "model_name": "codex-fallback",
      "provider": "codex-cli",
      "model": "gpt-5",
      "workspace": "/root/.picoclaw/workspace"
    }
  ]
}
```

Quando o `claude-cli` retorna erro (rate-limit, token expirado, API
indisponível), `pkg/providers/fallback.go` automaticamente tenta o
`codex-fallback`. Sem intervenção manual.

## Verificação

```bash
ssh root@<vps>
docker exec tenant-<id> codex auth status 2>&1 | head -5
# Esperado: signed in, account info, etc.
```

## Refresh de tokens

Codex CLI tokens expiram igual claude. Refresh:

```bash
# Atalho (operador re-uploads do local)
scp ~/.codex/auth.json root@<vps>:/etc/picoclaw/codex-auth/.codex/auth.json

# OU interativo
docker run --rm -it -v /etc/picoclaw/codex-auth:/auth -e HOME=/auth \
  ghcr.io/devjotaduo/picoclaw-launcher:main codex login
```

## Backup

`/etc/picoclaw/codex-auth/` é **incluído automaticamente** no backup R2
diário (mesma cobertura de `BACKUP_PATHS=/srv/saas/tenants /etc/picoclaw`
do `picoclaw-r2-backup.sh`).

## Failure modes

| Sintoma | Causa | Fix |
|---|---|---|
| `codex: command not found` no tenant | Imagem antiga (pre-PR que adicionou codex CLI) | `docker pull ghcr.io/devjotaduo/picoclaw-launcher:main` + recreate tenant |
| Fallback nunca dispara | `fallbacks: ["..."]` aponta pra `model_name` que não existe em `model_list` | Conferir alinhamento dos nomes |
| Codex calls falhando "not authenticated" | Auth dir vazio ou token expirado | Refresh acima |
| Tenant config válido mas log mostra "no fallback found" | Versão antiga do controlplane (pre-fallback chain) | Bumpa controlplane image |

## Como o fallback chain decide ir pra codex

`pkg/providers/fallback.go::FallbackChain`:

1. Tenta o provider primário (claude-cli)
2. Se erro for "rate-limited", "auth expired", "timeout", ou outros
   classificados como `FailoverReason`, marca o primário em cooldown
3. Itera `model.Fallbacks` em ordem, parando no primeiro que aceitar
4. Resposta volta com metadata mostrando attempts + qual ganhou

Cooldown evita martelar o primário enquanto ele está fora. Depois do
TTL, novas requests testam o primário de novo (claude > codex hierarquia
restaurada).

See also: [claude-cli-provider.md](claude-cli-provider.md) (provider
primário), `docs/architecture/public-tenant-promotion.md` (Sofia/Catarina
contexto de uso).
