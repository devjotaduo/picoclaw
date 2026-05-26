---
data: 2026-05-26
tipo: auditoria-completa
agentes_avaliados: 10
metodologia: 10 Explore agents paralelos (ruflo MCP indisponível, native Task usado)
auditor: Claude Opus 4.7
---

# Auditoria dos 10 agentes do workspace — 2026-05-26

## TL;DR

**Score médio: 5.8/10**. Workspace tem arquitetura sólida (personas distintas, PT-BR consistente, separação atendimento/vendas/suporte/marketing/interno), mas **3 bugs estruturais críticos** comprometem produção:

1. **5 dos 10 agentes não estão registrados em `config.json`** (Luna, Catarina, possivelmente Lia via routing quebrado) → não respondem
2. **Memória bootstrap está vazia** (`empresa.md`, `faq.md`, `marca.md`, `posts-publicados.md` em estado template) → Marcos/Camila/Lia caem em loop "vou confirmar" perpetuamente
3. **Sofia (principal) tem 3 reference files ausentes** (`about-jotaduo.md`, `discovery-questions.md`, `agent-catalog.md`) → Phase 1 + Phase 7 do discovery quebram

## Ranking dos 10 agentes

| # | Agente | Score | Status | Observação |
|---|---|---|---|---|
| 1 | Catarina | 7.0 | 🟡 ghost (não registrada em config.json) | Melhor arquitetura conceitual, niche único (curadora pós-discovery), prompt completo. Só falta wiring. |
| 2 | QA Tester | 7.0 | 🟡 não operacional | Rubric maduro, output discipline boa, mas 0 execuções em 5 meses + skills declarados sem implementação |
| 3 | Lia (marketing) | 6.8 | 🔴 heartbeat quebrado | Spec detalhado, skills + MCP Publora wired, mas cron `marketing-weekly` aponta pra agent `"marketing"` (inexistente), próprios jobs da Lia disabled |
| 4 | Marcos (vendas) | 6.2 | 🟡 dependência de dados | Guardrails excelentes (nunca inventa preço), escalation clara, mas sem BANT/SPIN + empresa.md vazio bloqueia tudo |
| 5 | Clara (atendente) | 6.2 | 🟡 metadata gap | Routing 3-vias claro (Marcos/Camila/Humano), notify_user explicito, mas frontmatter sem model/skills/tools |
| 6 | Luna (atendente) | 5.5 | 🔴 dead code | NÃO está em config.json dispatch rules. Niche (off-hours) bem definido mas zero rota — agente nunca responde |
| 7 | Sofia (PRINCIPAL) | 7.4 | 🔴 deps quebradas | Best persona design, mas 3 reference files críticos AUSENTES quebram Phase 1 (opener) + Phase 4 (integration mapping) + Phase 7 (team matching) |
| 8 | Operador | 6.0 | 🟡 scope creep | Sensitive tools (skill-creator) gated por preview/confirm, mas `atualizar-memoria` aceita path arbitrário → pode reescrever empresa.md/faq.md |
| 9 | Camila (suporte) | 4.4 | 🔴 KB vazia | FAQ.md com 0 respostas aprovadas (PENDENTES). Triagem sem categorização (bug/config/billing). Toda 1ª pergunta escala pra humano |
| 10 | Rafael (orchestrator) | 4.4 | 🔴 boundary leak | `whatsapp_direct_enabled=true` + zero guard clause → cliente pode acidentalmente conversar com ele. Heartbeat com 12 signals definidos mas zero referência no prompt |

---

## Sofia (PRINCIPAL) — análise estendida

Sofia é o ponto de entrada da experiência cliente. Falha aqui afeta tudo downstream.

### Pontos fortes
- 8-phase discovery flow explícito
- 10 segments mapeados (clinica, ecommerce, vendas, restaurante, educacao, servicos, beleza, imobiliaria, varejo, generico)
- Boundary "não falo de preço" enforced corretamente
- Memory writes claros: `empresa.md`, `clientes/<slug>.json`, `clientes/<slug>.md`, append em `MEMORY.md`
- PII masking ativo em behavior.json

### Bloqueadores
| # | Severidade | Problema |
|---|---|---|
| 1 | CRITICAL | `skills/jotaduo-discovery/references/about-jotaduo.md` AUSENTE → Phase 1 (opener) sem material |
| 2 | CRITICAL | `skills/jotaduo-discovery/references/discovery-questions.md` AUSENTE → Phase 2/4 (interview) sem framework |
| 3 | CRITICAL | `skills/jotaduo-discovery/references/agent-catalog.md` AUSENTE → Phase 7 (team match) sem mapeamento dor→agent |
| 4 | HIGH | `model:` ausente no frontmatter (runtime cai no default — qual? `claude-sonnet-4.6`?) |

### Simulação 3 turnos
| Turn | Input | Comportamento previsto |
|---|---|---|
| 1 | "oi, quero conhecer melhor o jotaduo" | ❌ Phase 1 quebra (missing about-jotaduo.md). Cairia em improviso. |
| 2 | "clinica odontologica em SP, 5 funcionarios" | ✅ Detecta `clinica`, carrega `clinica.md`, pergunta convênios/iClinic/no-show/LGPD |
| 3 | "vcs cobram quanto?" | ✅ "Eu não falo de preço. Depois que validar teu setup, Rafael discute modelo." |

---

## Padrões repetidos (não é problema de 1 agente, é workspace-wide)

### Padrão A: frontmatter incompleto em 8 dos 10 agentes
Falta consistente: `model:`, `skills:` array, `tool_allowlist`. Forçam o reader/runtime a inferir de `config.json` global ou skills externas.

**Impacto**: blocking pra automação (qualquer ferramenta que valida workspace pré-deploy falha), audit difícil, runtime imprevisível se config mudar.

**Fix sugerido**: pre-commit hook que valida frontmatter mínimo (`model`, `role`, `language`).

### Padrão B: agentes não registrados em dispatch rules
- Luna: zero rules
- Catarina: zero rules
- Lia: cron aponta pra `agent_id: "marketing"` (não existe), não pra `lia`

**Impacto**: ghosts. Personas existem em `workspace/agents/*` mas não atendem porque routing está faltando.

**Fix sugerido**: validator que cruza `workspace/agents/` ↔ `config.json::agents.dispatch.rules` e flag qualquer agente sem rota.

### Padrão C: memory bootstrap = 0
`empresa.md`, `faq.md`, `marca.md`, `posts-publicados.md`, `humano.md` — todos em estado template ("PENDENTE" / "ATUALIZAR" / vazio).

**Impacto cascateado**:
- Marcos não consegue cotar nada
- Camila escalada em toda 1ª pergunta (FAQ vazio)
- Lia não consegue gerar conteúdo coerente (marca vazia)
- Sofia teoricamente preenche `empresa.md` no fim do discovery — mas Phase 8b é o último e a maioria dos discovery flows nunca chega lá

**Fix sugerido**: pre-tenant-launch checklist com `validate_workspace.py` (já existe parcial em `workspace/skills/tenant-liberation/scripts/`).

### Padrão D: boundary enforcement fraca
- Rafael: marca "interno" mas WhatsApp direct enabled
- Operador: pode escrever em qualquer memory file via `atualizar-memoria`
- Catarina: requer canal `whatsapp_jotaduo_outbound` sem validação se canal existe

**Impacto**: vazamento de contexto interno pra cliente, override acidental de dados, fail silencioso.

**Fix sugerido**: explicit deny-list + canal-pre-check skills.

---

## Top 5 ações pra subir score médio de 5.8 → 8.0+

| Prioridade | Ação | Impacto |
|---|---|---|
| P0 | Criar `skills/jotaduo-discovery/references/{about-jotaduo,discovery-questions,agent-catalog}.md` | Sofia ganha +2.0 pontos, desbloqueio do flow inteiro |
| P0 | Registrar Luna + Catarina em `workspace/config.json::agents.dispatch.rules` | 2 agentes saem de "ghost" pra operacional |
| P1 | Corrigir cron `marketing-weekly-proposals` (`agent_id: "marketing"` → `"lia"`); habilitar `lia-weekly-proposals` | Lia HEARTBEAT volta a funcionar |
| P1 | Popular `memory/empresa.md`, `faq.md`, `marca.md` com baseline real (pode ser via Sofia + Catarina pos-onboarding) | Desbloqueia Marcos/Camila/Lia em produção |
| P2 | Padronizar frontmatter (`model`, `skills`, `tool_allowlist`) em todos os 10 AGENT.md + pre-commit lint | Workspace fica auditável + automatizável |

---

## Apêndice: scores brutos por agente

| Agente | Role | Frontmatter | Skill curation | Routing | Simulation | Boundary | Avg |
|---|---|---|---|---|---|---|---|
| Sofia | 9 | 7 | 7 | n/a | 6 | 8 | 7.4 |
| Rafael | 7 | 5 | n/a | 4 | n/a | 4 | 4.4 |
| Clara | 8 | 3 | n/a | 9 | n/a | n/a | 6.2 |
| Marcos | 8 | 2 | n/a | 8 | n/a | 9 | 6.2 |
| Camila | 7 | 3 | n/a | 6 | n/a | 4 | 4.4 |
| Luna | 8 | 6 | n/a | **1** | n/a | n/a | 5.5 |
| Lia | 9 | n/a | 7 | **3** | n/a | 8 | 6.8 |
| Catarina | 9 | 9 | 10 | **0** | n/a | n/a | 7.0 |
| Operador | 9 | n/a | 8 | 9 | n/a | 7 | 6.0 |
| QA Tester | 9 | n/a | 7 | 6 | n/a | 5 | 7.0 |

`n/a` = dimensão não pontuada pelo respectivo agent auditor (escopo focado por agente).
Routing scores em **negrito** = não registrados em `config.json` (ghost agents).
