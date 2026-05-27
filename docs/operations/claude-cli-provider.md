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
# Esperado: credentials.json + outros
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

### 4. Configurar um tenant pra usar claude-cli

No `config.json` do tenant (ou no template do workspace), no `model_list`:

```json
{
  "model_list": [
    {
      "model_name": "default",
      "provider": "claude-cli",
      "model": "sonnet"
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
2. O diretório existe no host?

Se sim pra ambos, adiciona ao spec do container:

```yaml
ExtraMounts:
  - Source: /etc/picoclaw/claude-auth
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
| Tenant sem `/root/.claude/credentials.json` | `PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR` não setado OU diretório vazio | Verificar env do controlplane + `ls /etc/picoclaw/claude-auth/.claude/` |
| Cliente errado responde (não Sofia em tenant publico) | Config tenant aponta pra `provider: "openai"` ainda | Atualizar `model_list` no `config.json` do tenant pra `provider: "claude-cli"` |
