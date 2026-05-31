# Configurador conversacional do atendente (propostas + aprovação)

**Objetivo (v2.0):** dar ao dono do tenant um assistente que **propõe** mudanças
na configuração do atendente público, sem nunca aplicá-las sozinho. Toda
mudança vira um card de aprovação no painel; só quando o dono clica **Aprovar**
é que a definição do atendente (`AGENT.md` / `SOUL.md` / `behavior.json`) é
reescrita. É o modelo **approval-always**: o agente encena, o humano decide.

Esta página documenta o contrato ponta a ponta — tool do agente, endpoints do
launcher, serviço de apply compartilhado e o card no frontend.

## Visão geral

```
assistente (LLM) ──tool propose_attendant_config──▶ POST /api/attendant-proposals
                                                      │ (stage; NÃO aplica)
                                                      ▼
                                            notification kind=approval
                                                      │
                            dono vê o card em /agent/proposals
                                                      │
                         Aprovar ─▶ POST /{id}/approve ─▶ applyAgentDefinition
                                                      │     (reescreve AGENT.md/
                                                      │      SOUL.md/behavior.json
                                                      │      + gateway reload)
                         Rejeitar ─▶ POST /{id}/reject ─▶ descarta (nada aplica)
```

O ponto central de segurança: **o agente só consegue encenar (`stage`)**. O
endpoint de `approve` é o único caminho que aplica, e ele é protegido pela
sessão do dashboard (o dono). O assistente não tem rota para aplicar direto.

## Componentes

### Tool do agente — `propose_attendant_config`

`pkg/tools/propose_attendant_config.go`. Espelha o `notify_user`: faz
`POST` no launcher local (`PICOCLAW_LAUNCHER_BASE_URL`, default
`http://127.0.0.1:18800`) com o header `X-Picoclaw-Internal-Token`
(o launcher injeta esse token no env dos processos-filho). Registrada em
`pkg/agent/agent_init.go` para todos os agentes; a autorização real mora no
endpoint de aprovação, então registrar a tool amplamente é seguro.

### Endpoints do launcher — `web/backend/api/attendant_proposals.go`

| Método | Rota | Quem chama | Efeito |
|---|---|---|---|
| `POST` | `/api/attendant-proposals` | assistente (token interno) | encena uma proposta; cria notification `kind=approval`; **não aplica** |
| `GET` | `/api/attendant-proposals?pending=true` | dashboard (sessão) | lista propostas pendentes |
| `POST` | `/api/attendant-proposals/{id}/approve` | dono (sessão) | aplica via `applyAgentDefinition`; idempotente (2ª vez = 409) |
| `POST` | `/api/attendant-proposals/{id}/reject` | dono (sessão) | descarta |

O store é em memória (espelha o `notificationStore`): propostas são
transitórias. Uma proposta perdida num restart só faz o assistente repropor;
nada foi aplicado.

### Serviço de apply compartilhado — `applyAgentDefinition`

`web/backend/api/agent_templates.go`. Extraído do
`handleApplyAgentTemplate` para que o editor HTTP do dashboard **e** a
aprovação de proposta compartilhem exatamente um caminho de escrita
(render + write `AGENT.md`/`SOUL.md`/`behavior.json` + save config + gateway
reload). Retorna `(result, httpStatus, err)`; preserva o mapeamento de status
400-vs-500 do editor.

### Notification kind `approval`

`web/backend/api/notifications.go` ganhou `NotificationKindApproval`. O card
de notificações renderiza com CTA apontando para `/agent/proposals`.

### Card no frontend — `/agent/proposals`

- `web/frontend/src/api/attendant-proposals.ts` — client (list/approve/reject).
- `web/frontend/src/hooks/use-attendant-proposals.ts` — poll 15s + mutations
  que invalidam as listas de propostas e de notifications.
- `web/frontend/src/components/agent/proposals/attendant-proposals-card.tsx` —
  o card (refined-minimalism; renderiza `null` quando a fila está vazia).
- `web/frontend/src/routes/agent/proposals.tsx` — a rota da fila.
- Link no menu: item `navigation.agent_proposals` em
  `web/frontend/src/components/app-sidebar.tsx` (grupo Agentes), i18n em
  `src/i18n/locales/{pt-br,en,zh}.json`.

## O que falta (Fase 3)

A **skill `configure-attendant`** (em `workspace/skills/`) que instrui o
assistente sobre *quando e como* usar a tool ainda não foi escrita. Ela exige
mexer no baseline do workspace (`make sync-baseline`), que é crítico para o
funil de cadastro — por isso ficou separada. Sem ela, a tool está registrada
mas o assistente não tem orientação proativa de uso.

## Como testar localmente

1. Suba o dev local (launcher `:18800` + vite do worktree `:5173`).
2. Login no dashboard do tenant.
3. Encene uma proposta (curl autenticado por sessão, ou deixe o assistente
   chamar a tool):
   `POST /api/attendant-proposals` com `{target_id, summary, reason, payload}`.
4. Abra `/agent/proposals` → o card mostra a proposta pendente.
5. **Aprovar** reescreve o `AGENT.md` do atendente (`name`/`description`/corpo)
   + `SOUL.md` + `behavior.json`; **Rejeitar** descarta sem aplicar.

Cobertura automatizada: `web/backend/api/attendant_proposals_test.go`
(stage-não-aplica, approve-aplica, reject-não-aplica, double-approve 409,
payload ausente 400, list pending-only).
