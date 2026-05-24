# Catálogo de Agentes Jotaduo (workspace local — equipe-pme-brasil)

Este catálogo lista os agentes **que já existem neste workspace** e como
recomendar combinações por segmento. Use durante a Fase 6 do discovery
para montar o time, justificando cada escolha pelas dores priorizadas.

Recomende de **2 a 5 agentes** por cliente (na primeira onda). Identifique
sempre **qual entra primeiro** (maior ROI percebido) e justifique.

## Agentes disponíveis no roster

| ID config | Nome | Workspace | Papel principal |
|---|---|---|---|
| `main` | Rafael | `workspace/` | Assistente interno do dono — orquestra equipe, alerta, resume, chama outros |
| `clara` | Clara | `workspace/` | Atendente principal (horário comercial) — triagem, FAQ, encaminhamento |
| `luna` | Luna | `workspace/` | Atendente noturna / fim-de-semana — triagem off-hours + briefing matinal |
| `marcos` | Marcos | `workspace/` | Consultor comercial — qualifica leads, BANT, agenda reunião, propõe |
| `camila` | Camila | `workspace/` | Suporte e pós-venda — orienta cliente, coleta dados, registra recorrência |
| `lia` | Lia | `workspace/agents/lia/` | Marketing digital — posts Instagram, catálogo HTML, calendário, campanhas |
| `operador` | Operador | `workspace/agents/operador/` | Operador técnico/dev — diagnóstico, github, terminal, skill-creator. Nunca cliente final |
| `qa-tester` | QA Tester | `workspace/agents/qa-tester/` | Testador interno — valida skills/agentes em ambiente simulado |
| `sofia` | Sofia | `workspace/` | Especialista em onboarding (você) — só ativa enquanto cadastro empresa incompleto |

## Mapeamento dor → agente (use pra justificar a recomendação)

### Atendimento e relacionamento

**Equipe sobrecarregada respondendo as mesmas perguntas** → `clara`
- Recebe primeiro contato, responde FAQ, encaminha. Em horário comercial.
- **Integrações típicas**: WhatsApp Business, Instagram DM.

**Cliente sem resposta fora do horário** → `luna`
- Cobre off-hours e fim-de-semana, faz triagem com SLA realista ("retorno pela manhã"), prepara briefing matinal pro Clara assumir.
- **Integrações típicas**: WhatsApp Business + handoff humano configurado.

**Cliente que some / baixa recorrência** → `camila`
- Pós-venda, reativação, lembrete de retorno, pesquisa satisfação.
- **Integrações típicas**: CRM (futuro), WhatsApp, lembretes via cron.

### Vendas

**Vendedor perdendo tempo com lead frio** → `marcos`
- Qualifica via BANT/SPIN, classifica funil (novo/qualificação/proposta/ganho/perdido), follow-up D+1/D+3/D+7, entrega lead pronto.
- **Integrações típicas**: formulário site, Meta/Google Ads, futura integração CRM.

**Ciclo de venda longo, ticket simples** → `marcos` + autorização explícita
- Por padrão Marcos **não fecha** — handoff em "lead qualificado com prazo", "pedido de contrato", "exceção comercial".
- Pra fechar venda direto, precisa flag `requires_confirmation` ajustado.

### Operação/backoffice

**Recepção sobrecarregada com agendamento (clínica/salão/oficina)** → criar `agente-agendador` ou expandir `camila`
- ⚠️ **Pendência:** não existe agente dedicado de agendamento hoje. Se a dor for crítica, propor criar via skill-creator (Operador) **OU** ampliar Camila pra cobrir agendamento.
- Integração com sistema clínico (iClinic/Doctoralia/Shosp/Feegow) precisa ser desenhada caso a caso — **marcar como "a validar"**.

**Inadimplência / cobrança** → criar `agente-cobranca` ou usar `rafael` + cron
- ⚠️ **Pendência:** não existe agente dedicado de cobrança. Hoje o Rafael pode disparar alertas via heartbeat + cron, mas não tem fluxo de negociação automatizada.

**Triagem de suporte técnico** → `camila` (extensão)
- Camila cobre suporte e pós-venda. Pra dor técnica específica, considerar criar `agente-suporte` separado.

### Conteúdo e marketing

**Time pequeno, presença digital fraca** → `lia`
- Cria rascunhos de post Instagram (feed/story/reel/carrossel), catálogo HTML, mini-sites, calendário sazonal, campanhas. **Não publica sem aprovação humana** (`approval_mode: owner_required`).
- **Integrações típicas**: Instagram, Buffer API (configurado), site público.

### Orquestração e diagnóstico

**Dono afogado em informação** → `main` (Rafael)
- Resumos diários/semanais, alertas proativos, identificação de oportunidades, chamada de outros agentes quando necessário.
- Atua apenas em números/grupos internos autorizados (`memory/canais-autorizados.md`).

**Operação técnica do tenant** → `operador`
- Diagnóstico (health, logs, canais), GitHub (issues/PRs via gh CLI), criação de skills. Chamado por dono, Rafael, ou cron.

**Validação de skills/agentes antes de ir pra produção** → `qa-tester`
- Roda cenários de 20+ interações simuladas, gera relatório por skill/agente com nota 0-10.

## Combinações típicas por segmento

| Segmento | Time inicial sugerido | Quem entra primeiro |
|---|---|---|
| Clínica/consultório | `clara` + `luna` + `camila` (+ `marcos` se vender particular) | `clara` — desafogo imediato no WhatsApp |
| E-commerce | `clara` + `marcos` (vendedor) + `camila` (pós) | `clara` — FAQ frete/prazo/troca consome 80% da fila |
| Vendas B2B | `marcos` + `camila` (pós/onboarding) + `rafael` (relatórios) | `marcos` — qualifica e devolve pronto pro humano |
| Restaurante/delivery | `clara` + `camila` (reclamação/troca) + `lia` (cardápio do dia) | `clara` — pedido/cardápio/disponibilidade |
| Educação/curso | `clara` + `marcos` (matrícula) + `camila` (cobrança/lembrete) | `marcos` — converter interessado em matrícula |
| Serviços (advocacia, agência, consultoria) | `clara` + `marcos` (orçamento) + `camila` (pós) | `clara` — agendar primeira reunião |

Estes são **pontos de partida**. Sempre adapte ao que o cliente trouxe.
Se a dor principal for inadimplência, sinalize a pendência de
`agente-cobranca` e ofereça workaround com Rafael + cron.
Se for pipeline vazio, Marcos entra primeiro mesmo em e-commerce.

## Quando uma dor não tem agente pronto

Cenários comuns:
- **Cobrança recorrente automatizada** — não existe `agente-cobranca`. Propor criação via `operador` + skill-creator, OU workaround com Rafael+cron.
- **Agendamento integrado com sistema clínico específico** (Shosp, Feegow, iClinic) — não existe `agente-agendador` integrado. Propor: (a) ampliar Camila pra orientar paciente a usar o sistema externo, (b) avaliar API do sistema pra integração real.
- **RH interno** — sem agente. Operador é o mais próximo, mas é dev/técnico.
- **Prospecção outbound** (cold outreach) — Marcos é inbound. Pra outbound precisa criar `agente-prospeccao` separado por questões de tom + LGPD.

Em todos esses casos: **marcar a pendência de integração/criação como "a validar"** no dossiê JSON (`integracoes_necessarias[]`), não prometer entrega.

## Regras de ouro

- Não recomende mais de **5 agentes** na primeira onda — confunde o cliente e trava a implantação.
- Sempre indique **um agente pra entrar primeiro** (maior ROI percebido) e justifique em 1 frase.
- Se faltar integração crítica (CRM, sistema clínico, gateway de pagamento), marque como **"a validar"** antes de prometer.
- Se o cliente não tem WhatsApp Business API, marque como **bloqueante de implantação** — sem isso, Clara/Luna/Camila não atendem.
- Cobre LGPD/CFM/regulação específica do segmento na recomendação. Saúde: receita/atestado/prontuário NÃO podem ir pelo agente. Educação: dados de menor de idade. Financeiro: limite de promessa de retorno.

## Onde os agentes existem fisicamente

```
~/.picoclaw/config.json                        ← roster + dispatch rules
workspace/AGENT.md                             ← protocolo da equipe
workspace/AGENTS.md                            ← spec narrativa
workspace/agents/<id>/AGENT.md                 ← override por agente (sofia, lia, operador, qa-tester)
workspace/agents/<persona>.md                  ← persona docs (clara, marcos, camila, luna, rafael)
```
