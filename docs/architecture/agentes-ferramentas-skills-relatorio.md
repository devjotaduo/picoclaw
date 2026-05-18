# Relatorio: ferramentas e skills necessarias por tipo de agente no PicoClaw

Data da analise: 2026-05-18

## Escopo

Este relatorio define o conjunto minimo recomendado de ferramentas runtime e skills para os tipos de agentes de negocio do PicoClaw. O objetivo e reduzir contexto, reduzir risco operacional e evitar que templates padrao carreguem capacidades que nao pertencem ao papel do agente.

Fontes analisadas:

- `web/frontend/src/components/agent/templates/catalog.ts`
- `web/backend/api/agent_templates.go`
- `web/backend/api/tools.go`
- `internal/orchestrator/orchestrator.go`
- `workspace/skills/*/SKILL.md`
- `CLAUDE.md`

## Premissas do PicoClaw

O runtime usa `AGENT.md` como fonte de verdade para frontmatter de agente. Se o frontmatter declara `tools`, essa lista vira allowlist fechada. Se nao declara `tools`, o agente pode receber todas as ferramentas globais habilitadas, o que nao e desejavel para agentes tenant-facing.

Existem duas camadas diferentes que nao devem ser misturadas:

| Camada | O que e | Onde fica | Exemplos |
|---|---|---|---|
| Templates do dashboard | Presets de negocio aplicados pelo usuario para gerar `AGENT.md`, `SOUL.md`, `behavior.json` e `agent_config.json` | `web/frontend/src/components/agent/templates/catalog.ts` e `web/backend/api/agent_templates.go` | `atendente-geral`, `atendente-clinica`, `atendente-loja`, `suporte-tecnico`, `vendas-prospec`, `assistente-interno` |
| Agentes internos padrao | Agentes reais do runtime/orquestrador, criados ou reparados automaticamente quando falta configuracao/workspace | `internal/orchestrator/orchestrator.go` | `main`/Ana, `vendas`/Leo, `marketing`/Maya, `assistente`/Sofia |

Portanto:

- Ana nao e um template do catalogo. Ana e o agente `main`, porta publica padrao. Ela pode receber um template, normalmente `atendente-geral`.
- Leo nao e o template `vendas-prospec`. Leo e o agente interno `vendas`, um especialista comercial chamado por Ana ou Sofia.
- Maya nao tem template de catalogo hoje. Maya e o agente interno `marketing`, com prompt/default proprio.
- Sofia nao e o template `assistente-interno`. Sofia e o agente interno `assistente`, privado/admin, com muito mais permissao que um assistente generico de RH/operacoes.

Ao aplicar um template pelo backend, o renderer escolhe a forma do `AGENT.md` pelo `agent_id`. Para `vendas`, `marketing` e `assistente`, ele usa templates internos especiais (`salesAgentMDTemplate`, `marketingAgentMDTemplate`, `assistantAgentMDTemplate`). Para qualquer outro agente, inclusive `main`, usa o template publico generico com a allowlist publica.

As `recommended_tools` do catalogo de templates sao nomes de negocio/integracao futura, como `create_service_ticket`, `check_available_slots` ou `book_sales_meeting`. Elas nao sao, hoje, ferramentas runtime registradas no PicoClaw. Portanto, elas devem aparecer como "integracoes recomendadas" ou roadmap do template, nao como `tools:` no `AGENT.md`.

As ferramentas reais expostas no catalogo de runtime incluem:

| Grupo | Ferramentas |
|---|---|
| Atendimento e dados | `customer_lookup`, `product_lookup` |
| Web | `web_search`, `web_fetch` |
| Comunicacao | `message`, `send_file` |
| Delegacao | `delegate`, `spawn`, `spawn_status`, `subagent` |
| Arquivos | `read_file`, `list_dir`, `write_file`, `edit_file`, `append_file`, `load_image` |
| Internas/operacao | `tenant_manager`, `whatsapp_report_query` |
| Marketing | `generate_image`, `save_marketing_proposal` |
| Dev/operador | `exec`, `cron`, `find_skills`, `install_skill`, MCP/discovery, hardware |

Regra geral: agente publico deve ter apenas ferramentas que pode usar diretamente com cliente. Agente interno pode ter mais poder, mas ainda por papel.

## Matriz recomendada

### Atendente Geral

Uso: porta de entrada publica, duvidas institucionais, triagem, reclamacoes, financeiro simples, encaminhamento.

Ferramentas necessarias:

- `customer_lookup`
- `web_search`
- `web_fetch`
- `message`
- `send_file`
- `delegate`

Ferramenta condicional:

- `product_lookup`: somente quando a empresa tiver catalogo de produtos/servicos pesquisavel no workspace.

Skills necessarias:

- `whatsapp-contact-profile`
- `whatsapp-conversation-summary`
- `whatsapp-lgpd-consent`
- `human-handoff-brief`
- `faq-answering`
- `intent-routing`
- `sector-routing`
- `lgpd-check`

Remover do padrao:

- Skills tecnicas, dev, hardware, automacao, auditoria pesada e criacao/instalacao de skills.
- `spawn`, `subagent`, `tenant_manager`, `exec`, `cron`, `install_skill`, `find_skills`.

Observacao: o catalogo atual de skills para `atendente-geral` esta coerente. O ajuste principal e manter `tools:` como allowlist curta e tratar ferramentas conceituais como integracoes futuras.

### Recepcao de Clinica

Uso: recepcao, agenda, remarcacao, cancelamento, convenio, preparo administrativo, urgencias de saude.

Ferramentas necessarias:

- `customer_lookup`
- `message`
- `send_file`
- `delegate`

Ferramentas condicionais:

- `web_search` e `web_fetch`: somente para consultar paginas oficiais/publicas da propria clinica, convenio ou autoridade de saude aprovada.
- `product_lookup`: nao deve entrar por padrao; usar apenas se servicos/procedimentos forem mantidos em catalogo estruturado.

Skills necessarias:

- `whatsapp-contact-profile`
- `whatsapp-conversation-summary`
- `whatsapp-lgpd-consent`
- `appointment-triage`
- `clinic-scheduling`
- `health-safety-routing`
- `sensitive-data-protection`
- `lgpd-check`

Skill opcional:

- `faq-answering`: util quando a clinica tem FAQ administrativo aprovado.

Remover do padrao:

- Skills de vendas, e-commerce, suporte tecnico, marketing, dev e operador.
- Ferramentas de arquivo e shell.

Observacao: este e o perfil mais sensivel. Evitar ferramentas amplas reduz chance de resposta clinica indevida, vazamento de dados de saude e excesso de contexto.

### Atendente de Loja / E-commerce

Uso: produtos, disponibilidade, frete, pedido, entrega, troca, devolucao, reembolso e pos-venda.

Ferramentas necessarias:

- `customer_lookup`
- `product_lookup`
- `web_search`
- `web_fetch`
- `message`
- `send_file`
- `delegate`

Skills necessarias:

- `whatsapp-contact-profile`
- `whatsapp-conversation-summary`
- `product-interest-extraction`
- `whatsapp-follow-up-planner`
- `human-handoff-brief`
- `order-status-triage`
- `returns-and-refunds-policy`
- `customer-identity-verification`
- `lgpd-check`

Skills opcionais:

- `faq-answering`: para politicas publicas da loja.
- `whatsapp-lgpd-consent`: quando houver coleta ativa, compartilhamento ou pedido de exclusao/correcao de dados.

Remover do padrao:

- Skills de clinica, RH, dev, hardware e criacao de skills.
- `exec`, `cron`, `tenant_manager`, `spawn`, `subagent`, `install_skill`.

Observacao: `customer-identity-verification` e obrigatoria antes de expor pedido, endereco, telefone, pagamento ou historico de compra.

### Suporte Tecnico

Uso: bug, erro, acesso, performance, integracoes, coleta de evidencias, base de conhecimento e escalacao para engenharia/produto.

Ferramentas necessarias:

- `customer_lookup`
- `web_search`
- `web_fetch`
- `message`
- `send_file`
- `delegate`

Ferramentas condicionais:

- `load_image`: somente se o canal e o modelo suportarem analise de prints/imagens como insumo.
- `product_lookup`: somente se o suporte depender de catalogo de produtos/modulos.

Skills necessarias:

- `whatsapp-conversation-summary`
- `human-handoff-brief`
- `technical-troubleshooting`
- `knowledge-base-resolution`
- `bug-report-builder`
- `log-sanitizer`
- `severity-classification`
- `security-incident-routing`

Skills opcionais:

- `customer-identity-verification`: necessaria se o suporte consultar conta, contrato, dados pessoais ou alterar configuracoes.
- `lgpd-check`: recomendada quando logs, prints ou tickets frequentemente incluem dados pessoais.

Remover do padrao:

- Skills de clinica, e-commerce, vendas consultivas e RH.
- `exec` no atendimento publico. Comandos de diagnostico devem ser internos e aprovados, nao ferramenta de agente publico.

Observacao: suporte tecnico pode receber logs e prints; por isso `log-sanitizer` deve vir antes de abrir bug report ou compartilhar evidencias.

### Vendas / Prospeccao (SDR)

Uso: captura de lead, qualificacao, BANT/SPIN, objecoes, proposta inicial, agendamento e handoff comercial.

Ferramentas necessarias:

- `customer_lookup`
- `product_lookup`
- `web_search`
- `web_fetch`
- `message`
- `send_file`
- `delegate`

Skills necessarias:

- `whatsapp-lead-capture`
- `whatsapp-contact-profile`
- `whatsapp-conversation-summary`
- `whatsapp-follow-up-planner`
- `product-interest-extraction`
- `human-handoff-brief`
- `lead-qualification`
- `bant-spin-discovery`
- `objection-handling`
- `sector-routing`

Skill opcional:

- `lgpd-check`: recomendada quando houver enriquecimento de lead, contato futuro ou dados comerciais sensiveis.

Remover do padrao:

- Skills de suporte tecnico, clinica, RH e dev.
- `tenant_manager`, `exec`, `cron`, `install_skill`, hardware.

Observacao: vendas deve tratar `web_search` como apoio para contexto publico e nao como autorizacao para inferir dados privados do lead.

### Assistente Interno / RH e Operacoes

Uso: colaboradores, politicas internas, RH, financeiro, TI, juridico, compras, denuncias, encaminhamentos e confidencialidade.

Ferramentas necessarias:

- `customer_lookup`
- `web_search`
- `web_fetch`
- `message`
- `send_file`
- `delegate`

Ferramentas condicionais:

- `whatsapp_report_query`: quando o assistente atende owner/admin e precisa gerar metricas ou relatorios.
- `read_file`, `list_dir`: quando politicas internas/documentos ficam no workspace.
- `write_file`, `edit_file`, `append_file`: somente se o papel permite registrar solicitacoes, atualizar documentos ou manter memorias com confirmacao.
- `tenant_manager`: somente para assistente privado/admin autorizado, nao para assistente interno generico de RH.
- `spawn`, `subagent`: somente para coordenar especialistas internos.

Skills necessarias:

- `internal-policy-search`
- `confidentiality-check`
- `conduct-case-routing`
- `lgpd-check`

Skills recomendadas para owner/admin:

- `whatsapp-report-builder`
- `whatsapp-conversation-summary`
- `human-handoff-brief`
- `sensitive-data-protection`
- `log-sanitizer`

Remover do padrao:

- Skills de e-commerce, clinica, vendas e suporte tecnico, salvo quando o assistente interno tambem for roteador geral de operacoes.
- `exec`, `cron`, hardware, instalacao de skills e descoberta MCP por padrao.

Observacao: o template `assistente-interno` do catalogo e mais conservador que a assistente privada `Sofia` do orchestrator. Convem manter essa separacao: RH/operacoes generico nao deve herdar poder de admin do dono.

## Agentes especialistas internos

Os especialistas abaixo aparecem no fluxo multi-agente e tem contratos diferentes dos templates publicos. Eles nao devem atender cliente final diretamente, salvo rota explicita.

### Leo, especialista comercial

Ferramentas runtime atuais:

- `read_file`
- `list_dir`
- `write_file`
- `edit_file`
- `append_file`

Ferramentas recomendadas se Leo passar a consultar dados diretamente:

- `customer_lookup`
- `product_lookup`

Skills necessarias:

- `lead-qualification`
- `bant-spin-discovery`
- `objection-handling`
- `product-interest-extraction`
- `whatsapp-follow-up-planner`

Observacao: se Leo receber sempre um briefing de Ana/Sofia, ele nao precisa de `message`, `web_search` ou `delegate`. Se virar agente comercial com entrada direta, deve usar o perfil `Vendas / Prospeccao`.

### Maya, especialista de marketing

Ferramentas runtime atuais:

- `read_file`
- `list_dir`
- `write_file`
- `edit_file`
- `append_file`
- `web_search`
- `web_fetch`
- `generate_image`
- `save_marketing_proposal`
- `send_file`

Skills necessarias:

- Nenhuma skill tenant-facing obrigatoria por padrao.

Skills opcionais:

- `summarize`: para resumir materiais longos.
- `agent-browser`: apenas em perfil operador/QA que precise testar paginas ou capturar screenshots.
- `ai-image-generation`: apenas no workspace de desenvolvimento/operador quando o fluxo usa CLI externo; no tenant, preferir `generate_image` como ferramenta runtime controlada.

Observacao: Maya nao deve receber skills de atendimento publico, LGPD generica de cliente ou vendas por padrao. O contrato dela e criar materiais e salvar entregas para aprovacao.

### Sofia, assistente privada/admin

Ferramentas runtime atuais:

- `read_file`
- `list_dir`
- `write_file`
- `edit_file`
- `append_file`
- `tenant_manager`
- `whatsapp_report_query`
- `spawn`
- `subagent`
- `send_file`

Ferramentas recomendadas:

- `delegate`: manter disponivel se a orquestracao preferir delegacao sincronica alem de `spawn`/`subagent`.
- `spawn_status`: util se o produto expuser acompanhamento de tarefas longas.

Skills necessarias:

- `internal-policy-search`
- `confidentiality-check`
- `whatsapp-report-builder`
- `whatsapp-conversation-summary`
- `human-handoff-brief`
- `lgpd-check`
- `sensitive-data-protection`
- `log-sanitizer`

Skills opcionais:

- `summarize`: para documentos, relatorios e transcricoes.
- `skill-creator`: apenas para workspace de operador/desenvolvedor, nao para tenant padrao.

Observacao: Sofia pode alterar workspace e agentes; por isso todo uso de `tenant_manager`, escrita de arquivo e envio externo deve exigir confirmacao e deixar rastro auditavel.

## Ferramentas e skills que nao devem ser padrao em templates de negocio

Nao incluir por padrao em agentes tenant-facing:

- `exec`
- `cron`
- `find_skills`
- `install_skill`
- `tool_search_tool_regex`
- `tool_search_tool_bm25`
- `i2c`
- `spi`
- `serial`
- `spawn`
- `spawn_status`
- `subagent`
- `tenant_manager`

Nao recomendar como skill padrao de template de negocio:

- `agent-browser`
- `github`
- `hardware`
- `skill-creator`
- `summarize`
- `tmux`
- `weather`
- `memory-and-knowledge-check`

Excecoes:

- `summarize` pode entrar em assistente admin/marketing quando documentos longos forem parte do papel.
- `agent-browser` pode entrar em operador/QA, nao em atendimento publico.
- `memory-and-knowledge-check` deve continuar opcional e de alto risco, ativada manualmente para auditoria, nao como default.

## Recomendacao de implementacao

O PicoClaw hoje aplica uma allowlist publica unica para templates publicos:

```text
customer_lookup, product_lookup, web_search, web_fetch, message, send_file, delegate
```

Isso e seguro o bastante para o baseline, mas ainda carrega `product_lookup` em clinica e atendente geral mesmo quando nao ha catalogo, alem de `web_search/web_fetch` em perfis que podem nao precisar de web.

Recomendacao:

1. Manter `tools:` sempre explicito em `AGENT.md`.
2. Criar allowlist por `template_id`, nao apenas por "publico vs especialista".
3. Renderizar `recommended_tools` do catalogo como secao informativa de integracoes futuras, nao como frontmatter.
4. Validar as skills habilitadas contra `workspace/skills`.
5. Manter o ajuste de contexto para todos os templates: janela minima alta, `max_tokens` de resposta separado e sumarizacao por limiar/percentual.

Allowlist sugerida por template:

| Template | Tools frontmatter |
|---|---|
| `atendente-geral` | `customer_lookup`, `web_search`, `web_fetch`, `message`, `send_file`, `delegate`; `product_lookup` condicional |
| `atendente-clinica` | `customer_lookup`, `message`, `send_file`, `delegate`; `web_search/web_fetch` condicional; `product_lookup` condicional |
| `atendente-loja` | `customer_lookup`, `product_lookup`, `web_search`, `web_fetch`, `message`, `send_file`, `delegate` |
| `suporte-tecnico` | `customer_lookup`, `web_search`, `web_fetch`, `message`, `send_file`, `delegate`; `load_image` condicional |
| `vendas-prospec` | `customer_lookup`, `product_lookup`, `web_search`, `web_fetch`, `message`, `send_file`, `delegate` |
| `assistente-interno` | base: `customer_lookup`, `web_search`, `web_fetch`, `message`, `send_file`, `delegate`; admin: adicionar `read_file`, `list_dir`, `write_file`, `edit_file`, `append_file`, `tenant_manager`, `whatsapp_report_query`, `spawn`, `subagent` |

## Criterios de aceite

Um template de agente esta corretamente enxuto quando:

- O `AGENT.md` renderizado declara `tools:` explicitamente.
- Cada ferramenta declarada existe no runtime ou e MCP permitido.
- O agente nao recebe ferramenta de escrita/admin se o papel e atendimento publico.
- As skills no frontmatter existem em `workspace/skills`.
- Skills de dev/operador nao aparecem em templates padrao de tenant.
- `recommended_tools` conceituais nao viram chamadas runtime inexistentes.
- O contexto inicial nao carrega skills irrelevantes para o papel.
