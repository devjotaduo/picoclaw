---
name: cli-delegation
description: "Cadeia de delegação para CLIs de agentes nativos. Tenta Anthropic Claude CLI primeiro, depois OpenAI Codex CLI, e só executa localmente como último recurso. Use para qualquer tarefa de geração que possa ser delegada a um sub-agente CLI externo."
visibility: dev
metadata: {"nanobot":{"emoji":"🪜","requires":{"bins":["claude","codex"]},"install":[{"id":"claude","kind":"npm","package":"@anthropic-ai/claude-code","bins":["claude"],"label":"Anthropic Claude Code CLI"},{"id":"codex","kind":"npm","package":"@openai/codex","bins":["codex"],"label":"OpenAI Codex CLI"}]}}
---

# CLI Delegation Skill

**Padrão thin-router**: os agentes internos (`pixel`, `doc-maker`, `dev-coder`)
**NÃO** fazem o trabalho. Eles apenas formulam um prompt completo e delegam
ao CLI externo. O CLI tem suas próprias ferramentas, plugins, MCPs, acesso
a arquivos, browsers, git, etc. — usa tudo isso por conta própria.

O agente interno é responsável por:

1. Receber o pedido humano.
2. **Formular o prompt** — claro, autocontido, com paths/arquivos relevantes
   listados explicitamente para o CLI saber onde olhar.
3. **Despachar via cadeia CLI** (regras abaixo).
4. **Relatar o resultado** — repassar o stdout do CLI, mais 1 linha no
   rodapé indicando qual CLI respondeu.

O agente interno **NÃO** deve:

- Tentar ler/escrever arquivos por si mesmo quando a tarefa cabe ao CLI.
- Carregar outras skills do workspace para tentar "ajudar" o CLI.
- Implementar fallback local elaborado — se ambos os CLIs falharem, relate
  o erro ao usuário e pare.
- Quebrar a tarefa em sub-pedidos ao CLI — passe o pedido inteiro de uma vez
  e deixe o CLI decidir como executar (ele tem seu próprio loop de tools).

## Cadeia de prioridade

A ordem é estrita. Só desça um degrau quando o anterior falhar (binário
ausente, timeout, exit code != 0, ou resposta vazia).

| Ordem | CLI | Comando base | Quando usar |
|---|---|---|---|
| 1 | **Anthropic Claude CLI** | `claude --print --dangerously-skip-permissions "<tarefa>"` | Sempre tente primeiro. Forte em raciocínio, texto longo, refatoração e código. Tem suas próprias tools (read/write/edit, bash, web fetch, MCP). |
| 2 | **OpenAI Codex CLI** | `codex exec "<tarefa>"` | Fallback se Claude não responder ou faltar binário. Tem sandbox próprio + ferramentas próprias. |
| 3 | **Reportar erro** | — | Se os dois CLIs falharem, NÃO tente trabalho local. Informe o usuário e pare. |

> O flag `--dangerously-skip-permissions` no Claude CLI desativa o prompt
> interativo de confirmação por tool (necessário em modo `--print`
> não-interativo). O CLI ainda roda dentro do container do tenant — o
> isolamento é o do Docker, não o do prompt.

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
   exec run command='claude --print --dangerously-skip-permissions "<tarefa>"' timeout=300
   ```
   - Se `exit_code == 0` e `stdout` não vazio → use `stdout` e marque
     `CLI: claude`. Fim.
   - Caso contrário → siga para o passo 2.

### Passo 2 — Codex CLI

1. Verifique o binário (`command -v codex` / `where.exe codex`). Se ausente,
   pule para o passo 3.
2. Execute o prompt:
   ```
   exec run command='codex exec "<tarefa>"' timeout=300
   ```
   - Se `exit_code == 0` e `stdout` não vazio → use `stdout` e marque
     `CLI: codex`. Fim.
   - Caso contrário → siga para o passo 3.

### Passo 3 — Reportar erro

Os dois CLIs falharam. **NÃO** tente executar a tarefa por conta própria
com tools internas — esse é o contrato thin-router. Responda ao usuário:

> "Não consegui executar a tarefa: ambos os CLIs externos
> (Claude, Codex) falharam. Detalhes: \<último stderr\>. Verifique auth
> (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) ou tente de novo."

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
- **Repasse o stdout literal** — não reformate, resuma ou "melhore" o
  output do CLI. O CLI é a fonte de verdade.
- **Não use suas próprias tools** para fazer o trabalho que o CLI deveria
  fazer (read/edit/write/git/etc). Você é router, não worker.
- **Logs**: opcionalmente registre tentativa, CLI escolhido e duração em
  `memory/cli-delegation.log` (uma linha por tentativa).

## Formulando o prompt para o CLI

Como o CLI vai executar com suas próprias ferramentas, o prompt precisa ser
**autossuficiente**:

- Diga **explicitamente o cwd / caminhos relevantes** (`/root/.picoclaw`,
  paths de arquivos). O CLI default usa o cwd do `exec`.
- Liste **artefatos esperados** ("crie `/output/X.pdf`", "abra PR no repo Y").
- Inclua **restrições** ("não toque em `secrets/`", "não rode `git push`").
- Para tarefas longas, peça **resumo final em 1 parágrafo** no fim do prompt
  pra economizar tokens no retorno.

## Quando NÃO usar esta skill

- O agente que invoca a skill é cliente-facing (Clara, Marcos, etc.) — esses
  jamais devem chamar CLI externo, é só para sub-agentes internos do operador.
- Ações destrutivas explícitas (`git push --force`, `rm -rf`). Confirmação
  humana primeiro, independente do CLI.
