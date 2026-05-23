# `default` — template baseline genérico

Template inicial para tenants criados sem customização específica.
Contém:

- **Agente principal** (`home/AGENT.md` + `SOUL.md`) — placeholder
  cliente-facing que o operador edita para casar com a marca do tenant.
- **3 sub-agentes internos thin-router** em `home/workspace/agents/`:
  - `pixel` — geração de imagens (delega para Claude CLI → Codex CLI)
  - `doc-maker` — geração de documentos (PDF/DOCX/MD)
  - `dev-coder` — programação (implementação, fix, refactor, testes)
- **Skill `cli-delegation`** em `home/workspace/skills/` — define a
  cadeia de delegação Claude → Codex → reportar erro
- **`config.json`** com placeholders `${LITELLM_KEY}`, `${LITELLM_URL}`,
  `${TENANT_ID}` que o provisionador substitui no momento da criação,
  e `agents.list` populado com main + pixel/doc/dev
- **`.security.yml`** baseline conservador

## Pré-requisitos para os sub-agentes funcionarem

1. A imagem `picoclaw-launcher:latest` precisa ter `claude` e `codex`
   no PATH — já feito no [docker/Dockerfile.launcher](../../docker/Dockerfile.launcher).
2. O tenant precisa de `ANTHROPIC_API_KEY` (e/ou `OPENAI_API_KEY`) no
   env do container — definir no compose ou nos secrets do provisioner.
3. O contrato thin-router está descrito na própria skill (ver
   `home/workspace/skills/cli-delegation/SKILL.md`).

## Customização por tenant

Após copiar este template, o operador edita via painel admin
(`adm.<base>/workspaces/<id>/files`) os pontos óbvios:

| Arquivo | O que mudar |
|---|---|
| `home/AGENT.md` | nome do agente principal, escopo do negócio do tenant |
| `home/SOUL.md` | identidade da marca, tom, valores |
| `home/config.json` → `agents.list[0]` | id/nome do main agent + canais que ele atende |
| `home/.security.yml` | abrir ferramentas extras se o tenant precisar |

Os sub-agentes (pixel/doc/dev) e a skill cli-delegation **não devem
ser editados por tenant** — eles são infra compartilhada. Mudanças
nessas peças devem vir via PR neste repo.
