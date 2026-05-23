---
name: cli-delegation
description: "Cadeia de delegação para CLIs de agentes nativos. Tenta Anthropic Claude CLI primeiro, depois OpenAI Codex CLI, e só executa localmente como último recurso. Use para qualquer tarefa de geração que possa ser delegada a um sub-agente CLI externo."
visibility: dev
metadata: {"nanobot":{"emoji":"🪜","requires":{"bins":["claude","codex"]},"install":[{"id":"claude","kind":"npm","package":"@anthropic-ai/claude-code","bins":["claude"],"label":"Anthropic Claude Code CLI"},{"id":"codex","kind":"npm","package":"@openai/codex","bins":["codex"],"label":"OpenAI Codex CLI"}]}}
---

# CLI Delegation Skill

Padrão de delegação para tarefas que podem ser executadas por sub-agentes CLI
nativos (Claude, Codex). Esta skill define a **cadeia de prioridade** que
todos os agentes internos especializados (`pixel`, `doc-maker`, `dev-coder`)
devem seguir antes de executar a tarefa por conta própria.

## Cadeia de prioridade

A ordem é estrita. Só desça um degrau quando o anterior falhar (binário
ausente, timeout, exit code != 0, ou resposta vazia).

| Ordem | CLI | Comando base | Quando usar |
|---|---|---|---|
| 1 | **Anthropic Claude CLI** | `claude --print "<tarefa>"` | Sempre tente primeiro. Forte em raciocínio, texto longo, refatoração e código. |
| 2 | **OpenAI Codex CLI** | `codex exec "<tarefa>"` | Fallback se Claude não responder ou faltar binário. Bom para geração zero-shot. |
| 3 | **Fallback local** | LLM próprio + ferramentas locais | Só se os dois CLIs falharem. Avise o usuário. |

> GitHub Copilot CLI foi removido da cadeia. Se reaparecer no futuro, entra
> como degrau adicional — não como degrau 1.

## Protocolo de tentativa

Antes de chamar cada CLI:

1. **Checar binário**: `command -v claude` (ou `where.exe claude` no
   Windows). Se ausente, pule para o próximo.
2. **Checar auth**: cada CLI precisa de login próprio (`claude` usa
   `ANTHROPIC_API_KEY` ou OAuth Claude Code; `codex` usa `OPENAI_API_KEY`
   ou `codex login`). Se não autenticado, pule.
3. **Timeout duro**: `timeout 120s <cmd>` no shell. Se estourar, mate
   e pule.
4. **Validar saída**: se stdout vazio ou exit != 0, pule.

## Como executar (passo a passo via tool `exec`)

> ⚠️ NÃO copie/cole um script bash com `$(...)` ou backticks. O `ExecTool`
> bloqueia command substitution (`pkg/tools/shell.go`). Em vez disso, faça
> uma sequência de chamadas individuais ao tool `exec` e use o `stdout` do
> próprio `ToolResult` como saída capturada.

### Passo 1 — Claude CLI

1. Verifique o binário:
   - Linux/macOS: `exec run command="command -v claude"`
   - Windows: `exec run command="where.exe claude"`
   - Se exit != 0 → pule para o passo 2.
2. Execute o prompt:
   ```
   exec run command='claude --print "<tarefa>"' timeout=120
   ```
   - Se `exit_code == 0` e `stdout` não vazio → use `stdout` e marque
     `CLI: claude`. Fim.
   - Caso contrário → siga para o passo 2.

### Passo 2 — Codex CLI

1. Verifique o binário (`command -v codex` / `where.exe codex`). Se ausente,
   pule para o passo 3.
2. Execute o prompt:
   ```
   exec run command='codex exec "<tarefa>"' timeout=120
   ```
   - Se `exit_code == 0` e `stdout` não vazio → use `stdout` e marque
     `CLI: codex`. Fim.
   - Caso contrário → siga para o passo 3.

### Passo 3 — Fallback local

Use seu próprio LLM + ferramentas internas. Marque `CLI: local`.

### Observações

- **Sem aspas com `$`**. Quando o prompt contiver `$`, use aspas simples
  no `command` (`'...$..​.'`) ou escape com `\$`. O deny pattern bloqueia
  `${var}` e `$(cmd)`.
- **Timeout**: passe `timeout=120` como parâmetro do `exec` em vez de
  prefixar `timeout 120s` no comando — mais previsível e o `exec` mata
  o processo limpo.
- **Auth ausente**: se o CLI falhar por falta de `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY`, NÃO peça segredo ao usuário no chat. Apenas reporte
  "CLI X indisponível (auth)" e desça o degrau.

## Regras de uso

- **Não exponha a cadeia ao usuário** a menos que ele pergunte. Apenas
  reporte qual CLI respondeu no rodapé: `(via claude-cli)`.
- **Nunca passe segredos no prompt** (tokens, senhas, chaves). Os CLIs
  podem logar prompts.
- **Sempre cite o resultado** — não invente. Se o CLI retornar JSON,
  parse com `jq` antes de mostrar.
- **Cache não é responsabilidade desta skill** — cada agente decide.
- **Logs**: registre tentativa, CLI escolhido e duração em
  `memory/cli-delegation.log` (uma linha por tentativa).

## Quando NÃO delegar

- Tarefas que dependem de estado local do tenant (ler `config.json`,
  `memory/*.md`, sessions). Faça você mesmo.
- Ações destrutivas (`git push --force`, `rm -rf`, alterações em
  produção). Sempre pedir confirmação humana antes.
- Tarefas que envolvem credencial do tenant (OAuth, tokens). Use o
  pipeline interno.
