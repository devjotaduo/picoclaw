# Relatorio: multi-agentes no PicoClaw

Data da analise: 2026-05-17

## Escopo

Este relatorio descreve como o sistema de multi-agentes funciona hoje no codigo e como a instalacao ativa esta configurada. A analise usa somente campos nao sensiveis da configuracao em `/root/.picoclaw/config.json` e os arquivos de prompt dos workspaces.

## Resumo executivo

O PicoClaw roda um unico `AgentLoop`, mas dentro dele existe um `AgentRegistry` com varios `AgentInstance`. Cada agente tem identidade, workspace, prompt, sessao, modelo, skills e registry de ferramentas proprios.

As relacoes entre agentes nao sao livres nem simetricas. Um agente so pode delegar para outro quando o agente pai tem `subagents.allow_agents` configurado, ou quando existe uma excecao contextual especifica para WhatsApp administrativo. Hoje, o agente principal `main` pode delegar para `vendas`, `marketing` e `programador`; os especialistas nao tem permissao declarada para delegar para outros agentes.

O roteamento inicial de mensagens e separado da delegacao. Mensagens de entrada sao roteadas por `agents.dispatch.rules` conforme canal, espaco, chat, remetente etc. Depois que um agente assume a conversa, ele pode chamar outro agente por ferramentas como `delegate`, `spawn` ou `subagent`.

## Topologia ativa hoje

Configuracao observada:

| Agente | Papel atual | Workspace | Modelo efetivo | Entrada direta | Pode delegar para |
|---|---|---|---|---|---|
| `main` | Ana, atendente virtual e porta de entrada | `/root/.picoclaw/workspace` | default `github-gpt-4o` resolvido para Copilot `gpt-4.1` | WhatsApp, panel, pico | `vendas`, `marketing`, `programador` |
| `vendas` | Consultor comercial | `/root/.picoclaw/agents/vendas` | `qwen-plus` via `AGENT.md` | panel, pico | nenhum agente nomeado |
| `marketing` | Estrategista Instagram | `/root/.picoclaw/agents/marketing` | `qwen-multimodal` via `AGENT.md` | panel, pico | nenhum agente nomeado |
| `programador` | Engenharia/software | `/root/.picoclaw/agents/programador` | default `github-gpt-4o` resolvido para Copilot `gpt-4.1` | sem rota panel/pico ativa hoje | nenhum agente nomeado |
| `gerente` | Administrativo/configuracao/metricas | `/root/.picoclaw/workspace-gerente` | default `github-gpt-4o` resolvido para Copilot `gpt-4.1` | panel, pico | nenhum agente nomeado |

Observacoes da topologia:

- `main` e o agente default.
- WhatsApp publico roteia para `main`.
- `programador` esta registrado e pode ser chamado por delegacao do `main`, mas hoje nao aparece nas rotas geradas de `panel`/`pico` porque nao tem `access.panel_enabled` configurado.
- `gerente` tem entrada direta pelo painel, mas nao esta na allowlist de subagentes do `main`. Portanto `main` nao deve chamar `gerente` em fluxo normal, salvo excecao de WhatsApp administrativo quando configurada.
- `spawn` e `subagent` estao habilitados; `spawn_status` esta desabilitado.

## Como os agentes sao definidos

Os tipos principais ficam em `pkg/config/config.go`:

- `AgentsConfig` contem `defaults`, `list` e `dispatch`.
- `AgentConfig` define `id`, `default`, `enabled`, `name`, `workspace`, `model`, `skills`, `subagents` e `access`.
- `SubagentsConfig` define `allow_agents` e um possivel override de modelo.
- `AgentAccessConfig` controla painel e WhatsApp direto.
- `DispatchConfig`/`DispatchRule` controlam o roteamento inicial de mensagens.
- `SubTurnConfig` controla profundidade, concorrencia, timeout e orcamento de tokens dos subturns.

Cada workspace tambem pode ter `AGENT.md`, `SOUL.md` e `USER.md`. O loader prefere `AGENT.md` e le frontmatter estruturado com `name`, `description`, `tools`, `model`, `skills` e `mcpServers`.

Ordem importante de precedencia:

- Modelo: `AGENT.md` ganha de `agents.list[].model`, que ganha de `agents.defaults.model_name`.
- Skills: `AGENT.md` ganha de `agents.list[].skills`.
- Ferramentas: se `AGENT.md` declara `tools`, vira allowlist fechada; se nao declara `tools`, o agente recebe as ferramentas globais habilitadas.
- Nome exibido/descoberto: `AGENT.md` pode sobrescrever o nome configurado.

Arquivos-chave:

- `pkg/config/config.go`
- `pkg/agent/definition.go`
- `pkg/agent/instance.go`
- `pkg/agent/tool_allowlist.go`

## Como o runtime monta tudo

Na inicializacao do gateway:

1. O gateway cria o provider de LLM inicial.
2. Cria `MessageBus`.
3. Cria `AgentLoop`.
4. `AgentLoop` cria `AgentRegistry`.
5. `AgentRegistry` instancia cada agente ativo de `agents.list`.
6. Cada `AgentInstance` recebe workspace, prompt, sessao, modelo, provider, context builder e tool registry.
7. Depois, `registerSharedTools` adiciona ferramentas compartilhadas a cada agente.

O registry tambem injeta descoberta de agentes no prompt de cada agente por meio do `ContextBuilder`. Essa descoberta nao lista todos os agentes: lista apenas os peers que o agente atual tem permissao de chamar.

Arquivos-chave:

- `pkg/gateway/gateway.go`
- `pkg/agent/agent_init.go`
- `pkg/agent/registry.go`
- `pkg/agent/discovery.go`
- `pkg/agent/prompt_contributors.go`

## Roteamento inicial de mensagens

Antes de qualquer delegacao, uma mensagem de entrada passa pelo `RouteResolver`.

O roteador olha para:

- `channel`
- `account`
- `space`
- `chat`
- `topic`
- `sender`
- `mentioned`

Se alguma regra em `agents.dispatch.rules` casa, o roteador escolhe o agente da regra. Se nenhuma regra casa, ele usa o agente default.

Hoje as rotas relevantes sao:

- `whatsapp` -> `main`
- `panel` com `space=agent:main` -> `main`
- `panel` com `space=agent:vendas` -> `vendas`
- `panel` com `space=agent:marketing` -> `marketing`
- `panel` com `space=agent:gerente` -> `gerente`
- `pico` com os mesmos espacos de `main`, `vendas`, `marketing`, `gerente`

O `programador` nao tem rota direta gerada hoje.

O roteamento tambem define a politica de sessao. Por exemplo, WhatsApp usa dimensao `chat`; painel usa `space` + `chat`, isolando conversas por agente/espaco.

Arquivos-chave:

- `pkg/routing/route.go`
- `pkg/agent/agent_message.go`
- `internal/orchestrator/orchestrator.go`

## Relacoes entre agentes

A relacao formal e `pai -> filhos permitidos`.

No codigo, `AgentRegistry.CanSpawnSubagent(parentAgentID, targetAgentID)` verifica:

- se o pai existe;
- se o pai tem `Subagents`;
- se `allow_agents` contem o alvo ou `*`.

Isso significa:

- Permissao e unilateral: `main -> vendas` nao implica `vendas -> main`.
- Agente sem `subagents.allow_agents` nao consegue chamar agente nomeado.
- `*` permite chamar qualquer agente registrado.
- Delegacao para si mesmo e bloqueada pela ferramenta `delegate`.

Hoje a relacao principal e:

```text
main
  -> vendas
  -> marketing
  -> programador

gerente
  -> nenhum por allowlist

vendas
  -> nenhum por allowlist

marketing
  -> nenhum por allowlist

programador
  -> nenhum por allowlist
```

Existe uma excecao contextual: se o agente atual e `main`, o canal e WhatsApp, e o remetente esta na lista administrativa `WhatsAppAllowedSenders`, o `main` pode delegar para qualquer agente interno listado. Hoje essa lista nao aparece preenchida na configuracao sanitizada observada.

Arquivos-chave:

- `pkg/agent/registry.go`
- `pkg/agent/agent_init.go`
- `internal/orchestrator/orchestrator.go`

## Modos de colaboracao

### `delegate`

`delegate` e a ferramenta mais clara para multi-agente nomeado.

Comportamento:

- recebe `agent_id` e `task`;
- valida allowlist;
- bloqueia delegacao para si mesmo;
- cria um SubTurn sincronico com `TargetAgentID`;
- espera o resultado;
- devolve ao LLM do chamador com prefixo `[Response from agent "..."]`.

O agente alvo roda com seu proprio workspace, modelo, ferramentas, prompt e skills.

Uso ideal: quando o agente principal precisa consultar um especialista e depois compor a resposta final para o usuario.

Arquivo-chave: `pkg/tools/delegate.go`

### `spawn`

`spawn` cria trabalho em background.

Comportamento:

- recebe `task`, `label` opcional e `agent_id` opcional;
- se `agent_id` for informado, valida allowlist;
- cria uma goroutine;
- chama SubTurn com `Async=true` e `Critical=true`;
- retorna imediatamente um `AsyncResult`.

Por ser `Critical=true`, o filho pode continuar rodando mesmo se o turno pai terminar normalmente. Se o pai ainda estiver ativo, o resultado pode entrar no canal `pendingResults`; se chegar tarde, pode virar follow-up via mensagem interna `system`.

Uso ideal: tarefas longas ou independentes.

Arquivo-chave: `pkg/tools/spawn.go`

### `subagent`

`subagent` executa um subturn generico sincronico, sem alvo nomeado.

Comportamento:

- recebe `task` e `label` opcional;
- roda como uma instancia independente baseada no agente atual;
- espera terminar;
- retorna resumo para o chamador.

Uso ideal: decompor uma tarefa dentro do mesmo perfil do agente, sem chamar outro especialista.

Arquivo-chave: `pkg/tools/subagent.go`

## Como o SubTurn funciona

SubTurn e a unidade real de execucao filha.

Quando um SubTurn nasce:

1. Aplica limites globais de profundidade e concorrencia.
2. Cria contexto independente com timeout.
3. Se `TargetAgentID` foi informado, busca esse agente no registry.
4. Faz uma copia rasa do `AgentInstance`.
5. Troca a sessao por uma sessao efemera em memoria.
6. Clona o registry de ferramentas para nao poluir o pai.
7. Cria `turnState` filho com `parentTurnID`, `depth`, `critical`, `pendingResults` e semaforo proprio.
8. Executa `runTurn` real com o pipeline normal.
9. Converte o resultado em `ToolResult`.
10. Se for async, tenta entregar o resultado ao pai.

Limites ativos hoje:

- `max_depth`: 2
- `max_concurrent`: 2
- `default_timeout_minutes`: 10
- `default_token_budget`: 8000
- `concurrency_timeout_sec`: 30

Ponto importante: SubTurns usam sessao efemera e `NoHistory=true`, entao nao escrevem historico persistente do agente alvo como uma conversa normal. Eles recebem a tarefa e podem usar contexto/prompt/tools do alvo, mas o historico do subturn e temporario.

Arquivos-chave:

- `pkg/agent/subturn.go`
- `pkg/agent/turn_state.go`
- `pkg/agent/turn_coord.go`

## Como o resultado volta para o pai

Existem dois caminhos principais:

1. Sincronico: `delegate` e `subagent` esperam o SubTurn terminar e recebem o `ToolResult` diretamente.
2. Assincronico: `spawn` retorna logo, e o resultado pode voltar depois por `pendingResults` ou por mensagem interna `system`.

Durante um turno normal, o pipeline consulta `pendingResults`. Quando encontra resultado de SubTurn, injeta uma mensagem especial no contexto do LLM do pai. Assim o pai pode continuar a raciocinar com a resposta do filho.

Quando a ferramenta async termina, o callback tambem pode publicar uma mensagem inbound no canal `system`. Essa mensagem e processada como follow-up pelo agente default, salvo canais internos.

Arquivos-chave:

- `pkg/agent/turn_coord.go`
- `pkg/agent/pipeline_execute.go`
- `pkg/agent/agent_message.go`

## Prompt e descoberta de agentes

O LLM nao precisa adivinhar IDs. O sistema injeta uma secao `Agent Discovery` no prompt do agente com JSON contendo agentes permitidos:

```json
{
  "agents": [
    {
      "id": "vendas",
      "name": "...",
      "description": "..."
    }
  ]
}
```

Essa lista e filtrada por permissao: se o agente nao pode delegar para um peer, esse peer nao aparece. Para WhatsApp administrativo, existe uma secao especial que pode mostrar todos os agentes internos permitidos naquele contexto.

Arquivos-chave:

- `pkg/agent/discovery.go`
- `pkg/agent/prompt_contributors.go`
- `pkg/agent/prompt.go`

## Ferramentas e escopo por agente

Cada agente tem seu proprio `ToolRegistry`.

Regras atuais:

- `main`: nao declara allowlist de ferramentas em `AGENT.md`, portanto recebe ferramentas globais habilitadas.
- `vendas`: nao declara allowlist de ferramentas em `AGENT.md`, portanto recebe ferramentas globais habilitadas; algumas ferramentas podem se negar em runtime por `agent_id`.
- `marketing`: declara allowlist de ferramentas em `AGENT.md`, entao fica restrito a `read_file`, `list_dir`, `write_file`, `edit_file`, `append_file`, `generate_image`, `save_marketing_proposal`, `send_file`.
- `programador`: nao declara allowlist de ferramentas, portanto recebe ferramentas globais habilitadas.
- `gerente`: nao declara allowlist de ferramentas, portanto recebe ferramentas globais habilitadas.

Algumas ferramentas aplicam restricao interna:

- `save_marketing_proposal`: so `marketing` ou `gerente`.
- `generate_image`: so `marketing` ou `gerente`.
- `tenant_manager`: so `gerente`.
- `whatsapp_report_query`: so `gerente` ou `marketing`.

Arquivos-chave:

- `pkg/agent/agent_init.go`
- `pkg/agent/tool_allowlist.go`
- `pkg/tools/orchestration_tools.go`
- `pkg/tools/registry.go`

## Painel e API interna

O painel usa endpoints do launcher/backend:

- `GET /api/internal-agents`
- `PUT /api/internal-agents/orchestration`
- `POST /api/internal-agents/{agent_id}/turn`
- `GET /api/internal-agents/{agent_id}/sessions`
- `GET /api/internal-agents/{agent_id}/proposals`

Quando o painel envia uma mensagem para um agente, o backend valida papel/acesso, encaminha para o gateway em `/internal/agent-turn` com token interno, e o gateway chama `AgentLoop.ProcessDirectWithContext` usando:

- `Channel: panel`
- `SpaceType: agent`
- `SpaceID: agentID`
- `ChatID: panel:<sessionID>`

Isso faz o roteador cair na regra `panel` daquele agente.

Arquivos-chave:

- `web/backend/api/internal_agents.go`
- `pkg/gateway/internal_agent_api.go`
- `web/frontend/src/api/internal-agents.ts`
- `web/frontend/src/components/agent/orchestration/orchestration-page.tsx`

## Fluxos praticos

### Fluxo 1: cliente no WhatsApp pede preco

1. Mensagem entra no canal `whatsapp`.
2. Dispatch roteia para `main`.
3. `main` ve no prompt que pode chamar `vendas`.
4. `main` usa `delegate(agent_id="vendas", task="...")`.
5. SubTurn roda como `vendas`, com prompt/modelo/skills/workspace de vendas.
6. `vendas` devolve resultado ao `main`.
7. `main` responde ao cliente com uma voz unica, sem expor troca de agente.

### Fluxo 2: admin fala com gerente no painel

1. Painel chama `/api/internal-agents/gerente/turn`.
2. Backend valida papel do ator.
3. Gateway recebe `/internal/agent-turn`.
4. Contexto usa `panel` + `space=agent:gerente`.
5. Dispatch roteia para `gerente`.
6. `gerente` pode usar ferramentas administrativas, como `tenant_manager`, se o pedido for confirmado.

### Fluxo 3: main chama programador

1. `programador` nao tem rota direta no painel hoje.
2. Ainda assim, `main` pode chama-lo porque `programador` esta em `main.subagents.allow_agents`.
3. A chamada por `delegate` roda o subturn com o workspace e prompt do programador.

## Pontos de atencao

1. `spawn_status` esta desabilitado. Tarefas em background podem rodar, mas o LLM nao tem a ferramenta de consulta de status registrada hoje.
2. `programador` esta delegavel pelo `main`, mas nao esta exposto como agente de painel/pico por rota gerada.
3. Agentes sem allowlist de ferramentas em `AGENT.md` recebem todas as ferramentas globais habilitadas. A seguranca fica dependente das checagens internas das ferramentas e do sandbox/config global.
4. `spawn` pode ter dois mecanismos de retorno: injecao via `pendingResults` quando o pai ainda esta vivo e follow-up via mensagem interna `system` quando o callback async publica resultado. Isso e poderoso, mas merece teste operacional para evitar resposta duplicada em tarefas muito rapidas.
5. SubTurns usam sessao efemera. Isso evita poluir historico persistente, mas tambem significa que uma delegacao nao fica registrada como conversa normal do agente alvo.
6. Permissoes sao por agente pai, nao por tipo de tarefa. Se `main` pode chamar `programador`, o controle fino depende do prompt e das ferramentas permitidas.

## Arquivos de referencia rapida

| Area | Arquivo |
|---|---|
| Estrutura de config | `pkg/config/config.go` |
| Registry multi-agente | `pkg/agent/registry.go` |
| Instancia de agente | `pkg/agent/instance.go` |
| Loader de `AGENT.md` | `pkg/agent/definition.go` |
| Roteamento | `pkg/routing/route.go` |
| Processamento de mensagem | `pkg/agent/agent_message.go` |
| SubTurn | `pkg/agent/subturn.go` |
| Estado de turno | `pkg/agent/turn_state.go` |
| Loop coordenador | `pkg/agent/turn_coord.go` |
| Tool loop | `pkg/agent/pipeline_execute.go` |
| `delegate` | `pkg/tools/delegate.go` |
| `spawn` | `pkg/tools/spawn.go` |
| `subagent` | `pkg/tools/subagent.go` |
| API interna do painel | `web/backend/api/internal_agents.go` |
| API interna do gateway | `pkg/gateway/internal_agent_api.go` |
| Orquestrador SaaS/especialistas | `internal/orchestrator/orchestrator.go` |

