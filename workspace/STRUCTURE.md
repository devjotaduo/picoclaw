# STRUCTURE — Workspace equipe-pme-brasil

Documentação da estrutura de diretórios e arquivos do workspace.

---

## Arquivos raiz

| Arquivo | Papel |
|---|---|
| `AGENT.md` | Ponto de entrada do workspace. Lista agentes e regras principais. Carregar primeiro. |
| `AGENTS.md` | Especificação completa de cada agente: função, skills, permissões de memória, limites. |
| `IDENTITY.md` | Quem somos: missão, equipe, objetivo geral. |
| `SOUL.md` | Como nos comportamos: princípios, limites, proatividade, fairness. |
| `HEARTBEAT.md` | Rotina proativa do Rafael: o que observar, como alertar, rate-limit de alertas. |
| `TOOLS.md` | Ferramentas disponíveis no runtime. |
| `USER.md` | Quem usa o sistema: o dono da empresa e seus contextos. |
| `STRUCTURE.md` | Este arquivo. |

---

## `/config/`

Configurações globais da equipe. Lidas por todos os agentes.

| Arquivo | Conteúdo |
|---|---|
| `tone-of-voice.md` | Tom, linguagem, frases proibidas, frase oficial de transparência sobre IA. |
| `authorized-channels.md` | Números e grupos autorizados por agente. **Preencher antes do go-live.** |
| `company-profile.md` | Perfil completo da empresa: nome, segmento, preços, FAQ, contatos. **Preencher antes do go-live.** |
| `escalation-rules.md` | Regras de escalonamento: quando e como transferir. |
| `privacy-policy.md` | Política LGPD: controlador, bases legais, retenção de dados, direitos do titular. |

---

## `/memory/`

Memória operacional da equipe. Cada arquivo tem seu TTL (ver `MEMORY.md`).

| Arquivo | Conteúdo | TTL |
|---|---|---|
| `MEMORY.md` | Índice, regras de uso, formato obrigatório de registro, retenção. | — |
| `empresa.md` | Informações validadas da empresa. | Permanente |
| `faq.md` | Perguntas e respostas frequentes. | Permanente |
| `canais-autorizados.md` | Mirror de `config/authorized-channels.md`. | Permanente |
| `leads.md` | Registro de leads com status e histórico. | 12 meses |
| `vendas.md` | Histórico de vendas e oportunidades. | 24 meses |
| `clientes.md` | Clientes com histórico de atendimento. | Relação + 12 meses |
| `atendimentos.md` | Registro de atendimentos. | 24 meses |
| `suporte.md` | Registros de suporte e problemas recorrentes. | 24 meses |
| `humano.md` | Casos transferidos para humano. | 36 meses |
| `melhorias.md` | Sugestões e melhorias identificadas pelos agentes. | Permanente |

---

## `/skills/`

Skills modulares da equipe, organizadas por domínio.

| Diretório | Visibilidade | Skills |
|---|---|---|
| `atendimento/` | `atendimento` | triagem-inicial, atender-grupos, coletar-informacoes, responder-duvidas, encerrar-atendimento |
| `vendas/` | `comercial` | classificar-lead, conduzir-venda, funil-comercial, agendar-reuniao |
| `suporte/` | `suporte` | atendimento-suporte, reclamacao-simples, pos-venda |
| `interno/` | `interno` | assistente-proativo, monitorar-operacao, chamar-agentes |
| `memoria/` | `global` | consultar-memoria, atualizar-memoria |
| `humano/` | `global` | transferir-para-humano, resumo-para-humano |
| `privacidade/` | `global` | detectar-pii, anti-fraude |
| `marketing/` | `interno` | criar-post-instagram, publicar-instagram, publicar-site-simples, sugerir-campanha, gerar-imagem-post |
| `analytics/` | `interno` | analisar-conversas, identificar-padroes, gerar-relatorio |
| `onboarding/` | `internal` | cadastrar-empresa, entrevistar-dono, identificar-perfil, preencher-memorias, glossario-simples, decidir-bloqueios-por-segmento, verificar-empresa, coletar-empresa-whatsapp |
| `onboarding/playbooks/` | `internal` | saude, alimentacao, varejo, servicos, beleza, educacao, imobiliaria, default |
| `qualidade/` | `dev` | testes-de-bias *(a criar)* |
| `acessibilidade/` | `dev` | atendimento-inclusivo *(a criar)* |
| `agent-browser/` | `dev` | — skill técnica, não usada em produção |
| `tmux/` | `dev` | — skill técnica, não usada em produção |
| `github/` | `dev` | — skill técnica, não usada em produção |
| `hardware/` | `dev` | — skill técnica, não usada em produção |
| `weather/` | `dev` | — skill técnica, não usada em produção |
| `summarize/` | `dev` | — skill técnica, não usada em produção |
| `skill-creator/` | `dev` | — para autores de skills, não para agentes de produção |

---

## `/agents/`

Arquivos de configuração individual de cada agente.

| Agente | Arquivo | Função |
|--------|---------|--------|
| Lia | `agents/lia/AGENT.md` | Marketing — posts, sites HTML, campanhas |
| Sofia | `agents/sofia/AGENT.md` | Onboarding — cadastro de empresas, playbooks por segmento |
| Operador | `agents/operador/AGENT.md` | Assistente interno — análise, relatórios, tarefas de bastidor |
| Clara | `agents/clara/AGENT.md` | Atendimento ao cliente final (flat file, diretório pendente) |
| Marcos | `agents/marcos/AGENT.md` | Vendas / prospecção (flat file, diretório pendente) |
| Camila | `agents/camila/AGENT.md` | Suporte técnico (flat file, diretório pendente) |
| Rafael | `agents/rafael/AGENT.md` | Monitor proativo / heartbeat (flat file, diretório pendente) |

---

## `/cron/`

Agendamentos e jobs periódicos. Usado pelo HEARTBEAT do Rafael para verificações proativas.

---

## `/sessions/`

Histórico de sessões de atendimento. Não contém dados pessoais brutos — apenas referências de ID.

---

## `/state/`

Estado interno do sistema.

| Subdiretório | Conteúdo |
|---|---|
| `audit/` | Logs append-only de ações sensíveis por data (`YYYY-MM-DD.log`). |
| *(outros)* | Estado de agentes em execução. |

---

## Regras de operação

- `config/company-profile.md` e `config/authorized-channels.md` devem ser preenchidos antes do go-live.
- Dados pessoais nunca devem ser salvos em texto bruto na memória.
- Logs de auditoria em `state/audit/` são append-only — nunca editar ou apagar.
- Skills com `visibility: dev` não devem ser chamadas por agentes de produção.
