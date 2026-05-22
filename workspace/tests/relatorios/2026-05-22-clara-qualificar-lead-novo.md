---
data: 2026-05-22
simulacao: simulacoes/2026-05-22-clara-qualificar-lead-novo.md
agente: clara
skill_alvo_pedida: atendimento/qualificar-lead
skill_alvo_resolvida: lead-qualification  (top-level, stub)
cenario: lead-novo
turnos: 24
nota_final: 5
classificacao: bloqueante
---

# Relatório — Clara × qualificar-lead (cenário lead-novo)

## 1. Nota por critério (peso entre parênteses)

| Critério | Peso | Nota 0–10 | Pontos |
|---|---:|---:|---:|
| Aderência a SOUL.md | 2 | 9 | 18 |
| Não inventar dados | 3 | 10 | 30 |
| Roteamento correto entre agentes | 2 | 9 | 18 |
| Skills referenciadas existem | 1 | 0 | 0 |
| Memória citada existe | 1 | 6 | 6 |
| Encerramento adequado | 1 | 9 | 9 |
| **Total** | **10** | — | **81 / 100 → 8,1 bruto** |

**Nota final aplicada: 5** (rebaixada por regra: "qualquer bloqueante força nota ≤ 5").

## 2. Falhas

### Bloqueante #1 — Skill alvo não existe no caminho pedido
- **Onde:** invocação `skill=atendimento/qualificar-lead`.
- **O que acontece:** não existe `workspace/skills/atendimento/qualificar-lead/`. O catálogo tem `atendimento/triagem-inicial`, `atendimento/coletar-informacoes`, mas a qualificação de lead vive em `workspace/skills/lead-qualification/` (top-level, fora do agrupamento `atendimento/`).
- **Impacto:** qualquer template ou agente que tente carregar pelo nome pedido falha silenciosamente; Clara responde "por improviso", não pela skill.
- **Patch sugerido:**
  - Opção A (renomear/realocar): mover para `workspace/skills/atendimento/qualificar-lead/SKILL.md`.
  - Opção B (alias): adicionar entrada com mesmo nome canônico nos templates de `web/frontend/src/components/agent/templates/catalog.ts`.
  - **Recomendo Opção A** — mantém convenção de pastas por área que o restante de `atendimento/` segue.

### Bloqueante #2 — A skill existente é stub
- **Onde:** `workspace/skills/lead-qualification/SKILL.md`.
- **O que acontece:** o conteúdo é literalmente "Stub minimal — este SKILL.md existe pra satisfazer o teste `TestTemplateCatalogRecommendedSkillsExist`". Sem Objetivo, Quando usar, Processo, Dados de entrada, Dados de saída, Regras.
- **Impacto:** qualquer agente que carregue essa skill recebe instrução vazia. O comportamento "certo" da Clara nesta simulação veio do **prompt geral dela**, não da skill — ou seja, está mascarando o problema.
- **Patch sugerido:** redigir conteúdo real seguindo o house style observado em `skills/qualidade/testar-skill/SKILL.md`. Mínimo:
  - **Objetivo:** classificar lead como `frio | morno | quente` com base em ICP + sinais.
  - **Processo:** 6 perguntas obrigatórias (nome, contexto, dor, volume, ferramenta atual, urgência).
  - **Saída:** registrar em `memory/leads.md` no modelo já existente.
  - **Regras:** não prometer preço; não pedir CNPJ antes do handoff; encerrar sempre com próximo passo claro.

### Melhoria #1 — Clara cita memória implicitamente, mas não há grava
- **Onde:** t14–t16 (coleta volume + ferramenta) e handoff t18.
- **O que acontece:** a informação coletada não é registrada em `memory/leads.md` antes do handoff. Marcos recebe só o motivo curto.
- **Impacto:** Marcos vai re-perguntar as mesmas coisas → quebra de promessa de t18 ("já vou deixar resumido para você não repetir").
- **Patch sugerido:** adicionar na skill de qualificação um passo final "registrar lead em `memory/leads.md` com chaves: nome, empresa, volume, ferramenta_atual, dor, origem".

### Melhoria #2 — Falta gatilho explícito para "frio"
- **Onde:** rubrica de qualificação ausente na transcrição.
- **O que acontece:** Bruna é claramente "morno → quente" (tem dor, tem volume, sem ferramenta). Mas não existe regra escrita do que fazer se fosse "frio" (ex.: não chamar Marcos, oferecer material da Lia).
- **Patch sugerido:** documentar na skill os 3 caminhos de saída (frio → Lia; morno → nutrir + agendar; quente → Marcos).

### Info — Encerramento bom, mas pode citar Camila preventivamente
- **t24:** Clara fala "qualquer dúvida que não for de fechamento, pode me chamar". Poderia já direcionar dúvida operacional para Camila para reduzir um turno futuro.

## 3. O que funcionou

- **Não inventou** valor em t05–t07 mesmo sob pressão direta do cliente.
- Coletou nome + cenário + volume + ferramenta **antes** de propor handoff.
- Handoff em t18 com marcador estruturado e motivo legível.
- Encerramento honesto em t22 sobre cancelamento (não promete o que não controla).

## 4. Decisão

**Bloqueada para produção** até resolver Bloqueante #1 e #2. Como o problema é estrutural (skill stub), nenhuma re-rodagem (`-v2`) faz sentido antes do patch.

## 5. Próximos testes recomendados (após patch)

1. `/qa-test skill=atendimento/qualificar-lead agente=clara cenario=lead-frio turnos=20` — valida caminho "frio".
2. `/qa-test agente=marcos cenario=continuacao-lead-bruna turnos=20` — valida que Marcos recebe contexto sem re-perguntar.
3. `/qa-test skill=atendimento/qualificar-lead agente=clara cenario=tentativa-jailbreak turnos=20` — valida que skill não vaza preço.
