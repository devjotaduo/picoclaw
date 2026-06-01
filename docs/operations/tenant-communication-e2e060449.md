# Relatorio de Comunicacao E2E - tenants e2e060449

Data: 2026-06-01 UTC

## Objetivo

Testar como cada tenant se comunica, se as respostas estao coerentes com o tipo escolhido, qual e o processo de configuracao e quais bugs aparecem no fluxo.

## Processo De Configuracao Observado

1. O controlplane cria o tenant em `POST /api/v1/tenants`.
2. O registro final fica no Postgres, tabela `tenants`.
3. O workspace base e copiado para `/srv/saas/tenants/<tenant_id>/workspace`.
4. O launcher usa:
   - `config.json` para agentes, modelos, canais e ferramentas.
   - `launcher_policy.json` para permissoes por papel.
   - `ui-visibility.json` para perfil visual (`public`, `admin`, `tenant`).
   - `workspace/memory/empresa.md` como memoria inicial.
5. Comunicacao privada no painel:
   - Login em `POST /api/auth/login`.
   - Conversa por `POST /api/internal-agents/sofia/turn`.
6. Comunicacao publica:
   - UI tenta WebSocket em `/pico/ws?session_id=...`.
   - A permissao efetiva para visitante anonimo vem de `launcher_policy.json`.
   - Para abrir o WebSocket publico, `public.channel:pico` precisa estar `write`.

## Resultado Por Tenant

| Tipo | Tenant | Canal testado | Status | Latencia | Nota | Observacao |
| --- | --- | --- | --- | ---: | ---: | --- |
| publico | e2e060449-pub-fd152a | `/pico/ws` | ok | 5.373s | 10/10 | WebSocket publico corrigido; Sofia respondeu e fez pergunta inicial de configuracao. |
| publico | brendo7-28d580 | `/pico/ws` | ok | 2.837s | 9/10 | Sofia respondeu corretamente; bug de marcador interno foi corrigido e retestado sem vazamento. |
| admin / Equipe Jota Duo | e2e060449-admin-67b8c2 | Sofia interna | ok | 17.208s | 8/10 | Responde como Sofia apos correcao; menciona Rafael como parte da operacao interna, o que e aceitavel. |
| cliente | e2e060449-cli-157a0b | Sofia interna | ok | 14.617s | 10/10 | Coerente com onboarding de empresa generica. |
| atendimento-geral | e2e060449-atend-29610a | Sofia interna | ok | 10.416s | 10/10 | Pergunta correta sobre tipos de solicitacao dos clientes. |
| clinica | e2e060449-clinica-ffe310 | Sofia interna | ok | 11.745s | 10/10 | Usa vocabulario de paciente, consulta e agendamento. |
| loja | e2e060449-loja-9f900f | Sofia interna | ok | 16.362s | 10/10 | Pergunta sobre catalogo, Instagram, marketplace, WhatsApp ou e-commerce. |
| restaurante | e2e060449-rest-0a8941 | Sofia interna | ok | 23.863s | 10/10 | Pergunta sobre cardapio, precos e disponibilidade. |
| imobiliaria | e2e060449-imob-eca281 | Sofia interna | ok | 10.128s | 10/10 | Pergunta venda, locacao ou ambos. |
| servicos | e2e060449-serv-c306ce | Sofia interna | ok | 13.790s | 10/10 | Pergunta servicos oferecidos e como o cliente pede atendimento/orcamento. |

Media dos 8 tenants privados: 14.766s por resposta. Pior latencia: restaurante, 23.863s.

## Coerencia Das Respostas

As respostas privadas ficaram coerentes depois da correcao:

- Todos os tenants privados responderam como Sofia.
- Nenhuma resposta usou emoji.
- Todos indicaram uma proxima pergunta de configuracao.
- Os verticais responderam com perguntas especificas do setor.

Exemplos:

- Clinica: pergunta sistema/canal de agendamento, confirmacao e remarcacao.
- Loja: pergunta onde vende: catalogo, Instagram, marketplace, WhatsApp ou e-commerce.
- Restaurante: pergunta onde esta o cardapio atualizado para pedidos, precos e disponibilidade.
- Imobiliaria: pergunta venda, locacao ou ambos.
- Servicos: pergunta quais servicos oferece e como o cliente solicita atendimento ou orcamento.

## Bugs Encontrados

### 1. Sofia virava Rafael em tenants admin/cliente

Sintoma:

- `POST /api/internal-agents/sofia/turn` retornava `Sou Rafael...` nos tenants `admin` e `cliente`.

Causa:

- No `config.json` dos workspaces `admin` e `tenant`, agentes com pasta propria apontavam para `/root/.picoclaw/workspace`, entao Sofia lia o `AGENT.md` raiz em vez de `workspace/agents/sofia/AGENT.md`.

Correcao aplicada:

- Atualizei os workspaces dos agentes com diretorio proprio em:
  - `/srv/picoclaw-workspaces/tenant/home/config.json`
  - `/srv/picoclaw-workspaces/admin/home/config.json`
  - `/srv/saas/tenants/e2e060449-admin-67b8c2/config.json`
  - `/srv/saas/tenants/e2e060449-cli-157a0b/config.json`
  - `/srv/saas/tenants/e2efixcrm0608-971891/config.json`
- Agentes ajustados: `lia`, `sofia`, `operador`, `pixel`, `catarina`, `qa-tester`.
- Reiniciei os containers afetados.

Validacao:

- Admin pos-correcao: `Sou Sofia, consultora de discovery da Jotaduo`.
- Cliente pos-correcao: `Sofia, consultora de discovery da Jotaduo`.

### 2. Chat publico via Pico WebSocket falha com 401

Sintoma:

- `ws://172.20.0.12:18800/pico/ws?session_id=e2e-public-comm` retorna HTTP 401.
- `POST /api/pico/token` retorna apenas `configured/enabled/ws_url`, sem token nem cookie.
- A UI monta o WebSocket sem token: `/pico/ws?session_id=...`.

Evidencia:

- `GET /api/pico/info` retorna `configured=true`, `enabled=true`.
- `POST /api/pico/token` retorna 200, mas sem credencial.
- Logs registram `actor=anonymous role=public POST /api/pico/token`.

Correcao aplicada:

- A causa pratica era permissao insuficiente em `launcher_policy.json`: `public.channel:pico` estava `none`.
- Atualizei os tenants publicos ativos para `public.channel:pico=write` e mantive `operator.channel:pico=none`.
- Tenants corrigidos: `brendo-ac7eed`, `teste-7e5233`, `teste2-971cfc`, `teste3-c8e291`, `teste5-8585e8`, `brendo7-28d580`, `e2e060449-pub-fd152a`.
- Reiniciei os containers afetados.

Validacao:

- `e2e060449-pub-fd152a`: WebSocket conectou e respondeu em 5.373s.
- `brendo7-28d580`: WebSocket conectou e respondeu em 2.976s antes do ajuste de marcador; depois da correcao de prompt respondeu em 2.837s sem marcador interno.

Observacao:

- A imagem atual do controlplane gera `launcher_policy.json` dentro do binario Go. Como o fonte editavel nao esta montado nesta instalacao, instalei um reconciliador operacional em systemd para fechar a lacuna ate o proximo rebuild da imagem.
- Servico: `picoclaw-public-pico-policy-reconcile.service`.
- Timer: `picoclaw-public-pico-policy-reconcile.timer`, ativo a cada 30s.
- Script: `/srv/saas/scripts/reconcile-public-pico-policy.py`.
- O reconciliador so altera tenants com `ui-visibility.json` em `active_profile=public` e `default_profile=public`.

### 3. CRM dos tenants da matriz ficou sem backfill

Sintoma:

- Os 8 tenants privados criados antes da correcao de `OPENCRM_URL` continuam com `crm_contact_id=null`.

Status:

- Parcialmente corrigido para novos tenants. O tenant `e2efixcrm0608-971891`, criado apos corrigir `OPENCRM_URL`, recebeu `crm_contact_id=1`.
- Falta backfill opcional dos tenants antigos.

### 4. Marcador interno vazando na resposta publica

Sintoma:

- No primeiro reteste do tenant `brendo7-28d580`, Sofia respondeu corretamente, mas a mensagem publica terminou com `<|[SPLIT]|>`.

Causa provavel:

- O prompt de Sofia e uma skill auxiliar ainda descreviam SPLIT como marcador textual possivel, e o gateway publico nao filtra esse marcador na borda.

Correcao aplicada em `brendo7-28d580`:

- Atualizei `workspace/agents/sofia/AGENT.md` para dizer explicitamente que `<|[SPLIT]|>` e `SPLIT_MARKER` sao controle interno e nunca devem aparecer ao usuario.
- Atualizei `workspace/skills/user-provides-business-profile-shortcut/SKILL.md` para trocar o exemplo com `<|[SPLIT]|>` por paragrafos.
- Reiniciei `tenant-brendo7-28d580`.
- Apliquei a mesma regra nos workspaces base `publico`, `tenant`, `admin` e `default-business`, para novos tenants nao herdarem o marcador.

Validacao:

- Reteste via `ws://172.20.0.9:18800/pico/ws?session_id=e2e-brendo7-nosplit-0601`.
- Resposta: `Oi! Sou a Sofia, consultora de onboarding da Jotaduo... Pra comecar: qual e o nome da sua empresa e o que voces fazem?`
- Latencia: 2.837s.
- `HAS_SPLIT_LITERAL=False`.

## Logs E Metricas

- Containers dos 9 tenants da matriz e `brendo7-28d580` seguem `healthy`.
- Controlplane segue `healthy`.
- Timer `picoclaw-public-pico-policy-reconcile.timer` esta `active` e `enabled`; ultima execucao retornou `fixed=0`.
- Uso registrado no Postgres para `e2e060449-pub-fd152a`: 16 registros, 157.195 prompt tokens, 427 completion tokens, custo 0.000000.
- O teste de comunicacao privada gerou sessoes em `workspace/sessions/*` com escopo `agent:sofia`.
- `brendo7-28d580` persistiu o reteste em `workspace/state/evolution/task-records.jsonl` e em `workspace/sessions/sk_v1_<redacted>.*`.

## Ainda Falta

- Trocar o reconciliador operacional por correcao nativa no fonte Go do controlplane no proximo rebuild da imagem.
- Backfill CRM dos tenants criados antes da correcao de `OPENCRM_URL`.
- Opcional: reduzir latencia dos primeiros turns, especialmente restaurante (23.863s).
