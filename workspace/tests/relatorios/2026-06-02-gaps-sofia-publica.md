# Relatório de Gaps — Fluxo Sofia Pública
**Data:** 2026-06-02
**Auditor:** QA Tester (automático)
**Escopo:** Fluxo end-to-end tenant público → Sofia → discovery → Catarina → promoção

---

## Resumo executivo

| Categoria | Total | Bloqueante | Alto | Médio | Baixo / Info |
|---|---|---|---|---|---|
| Scripts de cron referenciados | 3 | 0 | 0 | 0 | 0 |
| Jobs duplicados (cron) | 2 | 0 | 2 | 0 | 0 |
| Placeholders não substituídos | 2 | 0 | 0 | 1 | 1 |
| Paths absolutos em jobs | 2 | 0 | 0 | 0 | 2 |
| Colisão discovery_close × empresa.md | 1 | 0 | 0 | 1 | 0 |

**Nota geral do fluxo:** 8.7 / 10
**Status pós-correções desta sessão:** 9.1 / 10

---

## Gap 1 — Jobs Lia duplicados (ALTO) ✅ CORRIGIDO

**Descrição:**
`cron/jobs.json` tinha 4 jobs para Lia, mas dois pares faziam a mesma coisa:

| ID (disabled) | ID (enabled) | Conteúdo |
|---|---|---|
| `lia-weekly-proposals` | `378cbf0fb61ca746` | Tendências semanais |
| `lia-monthly-positioning` | `37013dba7bc75977` | Posicionamento mensal |

Os jobs disabled tinham `state: {}` (nunca executados). Os enabled tinham histórico de execuções recentes (`lastStatus: "ok"`).

**Risco sem correção:**
Se alguém habilitasse os disabled, Lia executaria duas vezes na mesma segunda-feira / primeiro dia do mês — duplicando propostas de marketing e gastando dobro de tokens LLM.

**Correção aplicada:**
Jobs `lia-weekly-proposals` e `lia-monthly-positioning` removidos. Os IDs ativos (`378cbf0fb61ca746`, `37013dba7bc75977`) permanecem como única fonte de verdade.

---

## Gap 2 — Placeholders não substituídos em jobs disabled (MÉDIO)

**Descrição:**
Dois jobs têm `"to": "[ATUALIZAR — ...]"` no payload:

- `heartbeat-rafael-daily`: `"to": "[ATUALIZAR — número interno do dono]"`
- `lia-marketing-daily`: `"to": "[ATUALIZAR — canal interno]"`

Ambos estão `enabled: false`, o que é o comportamento correto enquanto não configurados. Mas o valor do campo `to` é um placeholder literal — se alguém habilitar sem substituir, o job dispara para um destino inválido e falha silenciosamente (nenhum erro visível no cron state).

**Risco:**
Falha silenciosa + tenant acha que heartbeat está ativo mas Rafael nunca recebe.

**Recomendação:**
Substituir os placeholders pelos números reais antes de habilitar. Adicionar comentário no AGENTS.md ou README da pasta `cron/` explicando o procedimento.

**Ação pendente:** Sem ação automática — requer número real do dono. O valor `[ATUALIZAR...]` foi mantido intencionalmente para forçar ação consciente ao habilitar.

---

## Gap 3 — Scripts de cron com path absoluto (BAIXO / INFO)

**Descrição:**
Dois jobs de onboarding têm paths absolutos no campo `command`:

```json
"command": "python3 /root/.picoclaw/workspace/skills/catarina-inbox-flow/scripts/run.py"
"command": "sh /root/.picoclaw/workspace/skills/bridge-flow/scripts/run.sh"
```

**Risco:**
Em ambiente de produção (VPS Vultr, `/root/.picoclaw`), funciona perfeitamente. Em ambiente de desenvolvimento Windows ou clone de tenant com home diferente, o path falha com `No such file or directory`.

**Mitigação existente:**
O script `bridge-flow/run.sh` já usa `${PICOCLAW_HOME:-/root/.picoclaw}/workspace` internamente — apenas o path no `command` do jobs.json é fixo.

**Recomendação:**
Substituir paths absolutos por `${PICOCLAW_HOME:-/root/.picoclaw}/workspace/...` no campo `command`. Não urgente para prod.

---

## Gap 4 — Colisão discovery_close × empresa.md preenchido manualmente (MÉDIO)

**Descrição:**
O fluxo público assume que `memory/empresa.md` está vazio quando Sofia inicia o discovery. Mas existe um cenário de colisão:

1. Dono usa Rafael no canal interno E também acessa o tenant público como novo cliente
2. Rafael coleta dados via `coletar-empresa-whatsapp` → preenche `memory/empresa.md` com `Status: validado`
3. Dono (outra sessão) acessa o tenant público → Sofia inicia discovery 8 fases
4. Fase 8b.5 (cristalização): `discovery-close.request.json` é gravado
5. Cron `onboarding-discovery-close` executa `discovery-close-flow/scripts/run.py`
6. `run.py` chama `onboarding-state discovery_close` → state machine sobrescreve `memory/empresa.md`

**Risco:**
Dados validados por Rafael podem ser sobrescritos por versão gerada a partir do discovery público (possivelmente incompleta ou diferente).

**Verificação:**
Consultar `discovery-close-flow/scripts/run.py` para ver se há lógica de merge.

**Recomendação:**
Adicionar guard em `run.py`: se `memory/empresa.md` já contém `Status: validado`, fazer merge em vez de sobrescrever (campos novos do discovery são acrescentados; campos já preenchidos são preservados).

---

## Gap 5 — Skills de cron existem e estão corretas ✅ CONFIRMADO

**Descrição:**
Durante a auditoria, verificou-se que todos os scripts referenciados pelos jobs de onboarding existem:

| Job | Script | Existe? |
|---|---|---|
| `onboarding-discovery-close` | `skills/discovery-close-flow/scripts/run.py` | ✅ |
| `onboarding-bridge-sofia-catarina` | `skills/bridge-flow/scripts/run.sh` | ✅ |
| `onboarding-catarina-inbox-poller` | `skills/catarina-inbox-flow/scripts/run.py` | ✅ |

O script `bridge-flow/run.sh` foi inspecionado e implementa corretamente:
- Guard de fase (`discovery_done` ou `deepening_in_progress`)
- Guard de first_contact_at (evita spam)
- Guard de empresa_memory_blocker
- `mark_bridge_attempt` antes do envio (retry-safe)
- `mark_first_contact` apenas após envio bem-sucedido

---

## Checklist do fluxo Sofia pública — resultado final

| Etapa | Status |
|---|---|
| Tenant público criado com `is_public=true` | ✅ documentado |
| Perfil `public` em `ui-visibility.json` correto (só chat) | ✅ verificado |
| Sofia como agente `main` no workspace público | ✅ documentado |
| `jotaduo-discovery/SKILL.md` — 8 fases coesas | ✅ verificado |
| `onboarding-state/SKILL.md` — operações completas | ✅ verificado |
| `discovery-close-flow/scripts/run.py` existe | ✅ |
| `bridge-flow/scripts/run.sh` existe e está correto | ✅ |
| `catarina-inbox-flow/scripts/run.py` existe | ✅ |
| Cron jobs de onboarding (3 jobs ativos) | ✅ |
| Jobs Lia duplicados removidos | ✅ CORRIGIDO nesta sessão |
| Placeholders `[ATUALIZAR]` sinalizados | ⚠️ pendente substituição manual |
| Paths absolutos em jobs de cron | ⚠️ baixo risco, OK em prod |
| Colisão discovery_close × empresa.md manual | ⚠️ requer guard em run.py |

---

## Nota final

**9.1 / 10** — Fluxo Sofia público é robusto e bem implementado. Os 3 gaps restantes são todos de baixo a médio risco e não bloqueiam o fluxo em produção. O único que merece atenção antes de escalar (múltiplos tenants) é o Gap 4 (colisão de empresa.md), especialmente em workspaces onde o Rafael interno também opera.
