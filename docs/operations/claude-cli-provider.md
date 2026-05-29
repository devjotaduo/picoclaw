# claude CLI provider em tenants SaaS

Tenants podem rodar LLMs **usando a subscription Claude do operador** via o
binário `claude` (Claude Code CLI) instalado dentro do launcher container,
em vez de chamar a Anthropic API com tokens pay-per-token.

**Quando faz sentido:**
- Dev/teste sem queimar créditos Anthropic
- Tenants demo onde a subscription do operador cobre o uso
- Volume baixo (subscription tem limites de uso mensais)

**Quando NÃO faz sentido:**
- Carga de produção alta (vai estourar limites da subscription)
- Múltiplos operadores com subscriptions separadas
- Compliance que exige tracking por-tenant de uso (subscription compartilhada
  não desagrega)

## Setup (uma vez no VPS)

### 1. Criar o diretório de auth no host

```bash
ssh root@<vps>
mkdir -p /etc/picoclaw/claude-auth
chmod 700 /etc/picoclaw/claude-auth
```

### 2. Fazer login OAuth no `claude` apontando HOME pra esse diretório

O `claude` CLI guarda credenciais em `$HOME/.claude/`. Apontando HOME pro
diretório que vamos compartilhar, a auth fica lá dentro.

**Opção A — `claude` instalado direto no host:**

```bash
npm install -g @anthropic-ai/claude-code
HOME=/etc/picoclaw/claude-auth claude /login
# Segue OAuth no browser (vai pedir pra abrir URL)
```

**Opção B — via docker (sem instalar claude no host):**

```bash
docker run --rm -it \
  -v /etc/picoclaw/claude-auth:/auth \
  -e HOME=/auth \
  ghcr.io/devjotaduo/picoclaw-launcher:main \
  claude /login
```

Quando o OAuth termina, deve existir `/etc/picoclaw/claude-auth/.claude/`
com arquivos de credenciais.

```bash
ls -la /etc/picoclaw/claude-auth/.claude/
# Esperado: .credentials.json + outros
```

### 3. Ligar a feature no controlplane

Adicionar em `/srv/saas/picoclaw/.env`:

```bash
PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR=/etc/picoclaw/claude-auth
```

Recriar o controlplane pra ele ler a env nova:

```bash
docker compose -p picoclaw-saas \
  -f /srv/saas/picoclaw/docker/saas/docker-compose.prod.yml \
  --env-file /srv/saas/picoclaw/.env \
  up -d --force-recreate controlplane
```

### 4. Roteamento do tenant

Para tenants novos, o provisioner faz isso automaticamente quando
`PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR` aponta para um diretório válido com
`.credentials.json`: ele troca o `config.json` materializado para
`provider="claude-cli"` e remove `model_list` sensível de `.security.yml`.

Para tenants existentes, rode `recreate` depois de configurar a env no
controlplane. O provisioner reescreve o `config.json` preservando o volume e
anexa o mount `/root/.claude` ao novo container:

```bash
docker exec controlplane picoclaw-tenantctl recreate <tenant-id>
```

Se for necessário fazer um hotfix manual sem passar pelo lifecycle, ajuste o
`config.json`:

```json
{
  "agents": {
    "defaults": {
      "provider": "claude-cli",
      "model_name": "claude-cli-sonnet"
    }
  },
  "model_list": [
    {
      "model_name": "claude-cli-sonnet",
      "provider": "claude-cli",
      "model": "sonnet",
      "workspace": "/root/.picoclaw/workspace"
    }
  ]
}
```

`provider: "claude-cli"` faz o agente rodar `claude` como subprocess. O
`model: "sonnet"` é passado como `-m sonnet` pro CLI (aceita `sonnet`,
`opus`, `haiku`, ou IDs específicos como `claude-sonnet-4-5`).

Recriar o tenant pra pegar o bind-mount novo (admin painel → "Recriar área"
ou via API).

## Como o provisioner ata tudo

`internal/saas/tenant/provisioner.go::buildSpec` checa:

1. `p.Cfg.TenantClaudeCliAuthDir` está setado (= operator opted in)?
2. O diretório existe no host e contém `.credentials.json` direto ou em
   `.claude/.credentials.json`?

Se sim pra ambos, adiciona ao spec do container:

```yaml
ExtraMounts:
  - Source: /etc/picoclaw/claude-auth/.claude
    Target: /root/.claude
    ReadOnly: true
```

Read-only é deliberado: refresh de tokens é responsabilidade do operador
no host. Tenant não pode rotacionar/vazar credentials.

## Refresh de tokens

OAuth tokens do Claude expiram. Quando isso acontece, todas chamadas de
todos os tenants falham até o operador rodar de novo:

```bash
HOME=/etc/picoclaw/claude-auth claude /login
```

Os tenants pegam automatic na próxima chamada (mount é live).

**Sinal de que precisa renovar**: tenant chat retorna erro do
claude-cli mencionando "unauthorized", "token expired", ou OAuth.

## Atalho usado no bootstrap (operador já tem Claude Code local)

Se você JÁ usa Claude Code na sua máquina (Mac/Linux/Windows), o arquivo
de credenciais já existe local em `~/.claude/.credentials.json`
(Windows: `C:\Users\<você>\.claude\.credentials.json`). Em vez de
fazer OAuth de novo no VPS, copie o arquivo direto:

```bash
# Linux/Mac:
scp ~/.claude/.credentials.json root@<vps>:/etc/picoclaw/claude-auth/.claude/.credentials.json

# Windows PowerShell:
scp $env:USERPROFILE\.claude\.credentials.json root@<vps>:/etc/picoclaw/claude-auth/.claude/.credentials.json
```

Depois `chmod 600` no destino. Funciona porque é o mesmo formato OAuth
que o `claude` no container espera. Validado em prod 2026-05-27.

## Backup

`/etc/picoclaw/claude-auth/.claude/.credentials.json` é **incluído por
padrão** no backup R2 diário (`scripts/backups/picoclaw-r2-backup.sh` —
`BACKUP_PATHS` cobre `/etc/picoclaw` desde o patch que acompanhou esta
feature). Perda do dir = restore via restic OU re-upload do
`.credentials.json` local do operador (o atalho acima).

## Fallback pra codex-cli quando claude rate-limita

Subscription Max tem limite mensal. Quando bate, todos tenants
claude-cli começam a falhar. Pra mitigar, configure também
`PICOCLAW_TENANT_CODEX_CLI_AUTH_DIR`; tenants novos recebem
`agents.defaults.model_fallbacks=["codex-cli-gpt-5"]` automaticamente.
Para tenants existentes, adicione esse fallback em `agents.defaults` e uma
entrada `codex-cli` no `model_list`. Setup completo:
[codex-cli-provider.md](codex-cli-provider.md).

## Por que read-only

Se o mount fosse read-write, um tenant comprometido poderia:
- Sobrescrever credenciais pra apontar pra própria Anthropic account
- Roubar refresh token (move pra exfil)
- Bloquear outros tenants ao corromper o arquivo

Read-only fecha esses vetores. O custo: refresh manual, mas o operador
estava no loop de qualquer jeito porque o OAuth do `/login` é interativo.

## Failure modes

| Sintoma | Causa | Fix |
|---|---|---|
| `claude: command not found` no tenant | Imagem antiga (pre-PR que adicionou claude CLI) | `docker pull ghcr.io/devjotaduo/picoclaw-launcher:main` + recreate tenant |
| `error: not authenticated` | Auth dir vazio ou token expirado | Rodar `claude /login` no host (passo 2) |
| Tenant sem `/root/.claude/.credentials.json` | `PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR` não setado OU diretório vazio | Verificar env do controlplane + `ls /etc/picoclaw/claude-auth/.claude/` |
| Cliente errado responde (não Sofia em tenant publico) | Config tenant aponta pra `provider: "openai"` ainda | Reprovisionar tenant novo ou atualizar `agents.defaults` + `model_list` no `config.json` do tenant pra `provider: "claude-cli"` |
