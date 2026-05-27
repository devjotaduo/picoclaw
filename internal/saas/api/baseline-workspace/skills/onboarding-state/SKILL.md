---
name: onboarding-state
description: >
  Máquina de estados do onboarding do tenant público. Sofia e Catarina chamam
  esta skill pra registrar progresso (discovery_done, area_complete,
  ready_for_promotion) e pra capturar as credenciais do owner (email +
  WhatsApp) que o admin vai usar quando promover o tenant pra cliente normal.
  Estado vive em workspace/state/onboarding.json — único arquivo que o
  backend de promoção lê pra decidir se pode liberar o tenant.
visibility: internal
---

# onboarding-state

State machine que cristaliza a jornada de cadastro de um tenant público até
ele estar pronto pra virar cliente normal. **Não conversa com cliente** —
é só um wrapper que escreve JSON estruturado no volume do tenant.

## Quando usar

- **Sofia** chama no fim do discovery (Phase 7.5+) pra:
  - `set_owner` quando capturar email/WhatsApp do dono
  - `mark_discovery_done` quando terminar as 8 fases + grava empresa.md
- **Catarina** chama em cada sessão de aprofundamento pra:
  - `mark_area_complete` quando fechar uma das 5 áreas (equipe, casos-excecao, faq, historico, regras-tacitas)
  - `mark_ready_for_promotion` automaticamente quando a 5ª área fechar
- **Admin** (via painel) lê este JSON pra decidir quando promover.

## Operações

Todas via `exec` de `scripts/state.py` com JSON no stdin.

### `init`
Cria o arquivo se não existe. Idempotente. Roda no primeiro turno da Sofia.

```json
{"action": "init"}
```

### `set_owner`
Captura nome + email + WhatsApp do dono. Validação básica de formato.

```json
{
  "action": "set_owner",
  "name": "Eduardo Silva",
  "email": "eduardo@empresa.com.br",
  "whatsapp": "+5511999998888",
  "captured_by": "sofia"
}
```

### `mark_discovery_done`
Sofia chama no fim do discovery (após gravar empresa.md). Inclui resumo
do segmento detectado pra Catarina contextualizar depois.

```json
{
  "action": "mark_discovery_done",
  "segment": "clinica",
  "summary": "Clínica odontológica em SP, 5 funcionários, usa Shosp..."
}
```

### `mark_first_contact`
Catarina chama **antes** de mandar a primeira mensagem WhatsApp pro lead
(idempotente). Funciona como "Catarina já está nessa" signal pro cron
de bridge (`onboarding-bridge-sofia-catarina` em `workspace/cron/jobs.json`)
parar de disparar Catarina a cada 15min.

```json
{
  "action": "mark_first_contact"
}
```

Seta `deepening.first_contact_at` na primeira chamada; chamadas seguintes
no-op. Sem essa marca, o cron acha que Catarina ainda não começou e
re-dispara, spamando o dono. **Sempre chame ANTES do
`enviar-whatsapp-jotaduo` na 1ª área.**

### `mark_outreach_sent`
Catarina chama **toda vez** que envia mensagem WhatsApp pro lead (não só
a primeira). Atualiza `deepening.last_outreach_at` pra agora. Sem isso o
timer de timeout (P1 #17) não tem ponto de referência.

```json
{"action": "mark_outreach_sent"}
```

### `mark_owner_response`
Catarina chama no pré-turno SEMPRE que `verificar-respostas-jotaduo`
retorna mensagens novas do lead. Atualiza `deepening.last_owner_response_at`.
Zera o timer de timeout — lead que respondeu não dispara alerta.

```json
{"action": "mark_owner_response"}
```

### `mark_area_complete`
Catarina chama ao fechar uma área de aprofundamento. Quando a 5ª área é
marcada, `promotion.ready` vira `true` automaticamente.

```json
{
  "action": "mark_area_complete",
  "area": "equipe"
}
```

`area` deve ser uma de: `equipe | casos-excecao | faq | historico | regras-tacitas`.

### `mark_ready_for_promotion`
Forçar `promotion.ready=true` (escape hatch — admin pode promover sem
todas as áreas completas, ex: cliente simples sem necessidade de
aprofundamento). Catarina raramente chama; admin usa via painel.

```json
{
  "action": "mark_ready_for_promotion",
  "reason": "cliente simples — sem necessidade de aprofundamento técnico"
}
```

### `get`
Lê o estado atual. Útil pra agentes consultarem onde estão.

```json
{"action": "get"}
```

Retorna o JSON inteiro do `workspace/state/onboarding.json`.

## Schema do arquivo

Ver `references/state-schema.md` pro schema completo (campos, tipos, valores válidos).

## Erros comuns

- **owner.email inválido** — script rejeita com erro claro. Sofia repete a pergunta.
- **area duplicada** — `mark_area_complete` é idempotente; não conta a área 2x.
- **promotion.ready sem owner capturado** — script bloqueia: precisa do email pra promover.
- **set_owner antes de init** — script auto-inicia. Não falha.

## Lead timeout monitoring (P1 #17)

Quando Catarina envia outreach e o lead não responde por
`LEAD_TIMEOUT_DAYS = 7`, o recompute adiciona uma linha
`lead_timeout_days: <N>` em `promotion.blocked_by` — **informativa, não
bloqueante**. Aparece só se outros blockers já existem (não-promotion-
ready ainda); um lead lento sozinho não impede promoção quando todas as
áreas estão cobertas.

Critério: `last_outreach_at > 7d ago AND (last_owner_response_at is null
OR last_owner_response_at > 7d ago)`. Se o lead respondeu depois do
último outreach, o clock reseta.

Pra Catarina manter o sinal preciso:
- Chamar `mark_outreach_sent` toda vez que enviar mensagem
- Chamar `mark_owner_response` no pré-turno quando
  `verificar-respostas-jotaduo` retornar mensagens novas

Admin consulta via `GET /api/v1/tenants/{id}/onboarding-state` (mesmo
endpoint do promote modal). Listagem de tenants stale em todo o fleet
fica pendente — não foi shipado nesse PR.

## Ground-truth check em `memory/empresa.md`

Marcar todas as 5 áreas como completas **não** é suficiente pra
`promotion.ready=true`. O script também verifica se `memory/empresa.md`
tem conteúdo real (não só o esqueleto do template). Critério:

- O arquivo precisa existir.
- Pelo menos 3 dos labels `Nome:`, `Segmento:`, `Descrição:` … têm
  valor não-vazio depois dos dois pontos.
- O valor não pode começar com `pendente` (marca de template).

Se falhar, o `blocked_by` ganha `empresa_memory_empty: <motivo>` mesmo
com discovery + owner + 5 áreas todos verdes. Isso garante que a
promoção nunca leva um tenant onde os agentes operacionais (Clara,
Marcos, …) inheritam uma memória vazia.

Para um cliente simples sem necessidade de curadoria, o admin usa
`mark_ready_for_promotion` (escape hatch) — mas mesmo nesse caso o
ground-truth check roda. O admin é responsável por preencher o
empresa.md manualmente antes ou aceitar o bloqueio.

## Sequência típica

```
1. Sofia.turn[1]:    init                              → discovery_in_progress
2. Sofia.turn[N]:    set_owner(email, whatsapp)        → owner_captured.* set
3. Sofia.turn[N+1]:  mark_discovery_done(segment)      → discovery.completed_at
4. (admin opcional libera tenant pra Catarina rodar via WhatsApp)
5. Catarina.day[1]:  mark_area_complete("equipe")      → deepening.areas_covered++
6. Catarina.day[2]:  mark_area_complete("casos-...")   → 2/5
7. ...
8. Catarina.day[5]:  mark_area_complete("regras-...")  → 5/5 + auto-promotion.ready=true
9. admin painel sees ready_for_promotion=true → clica "Promover" → backend lê este JSON
```

## Por que JSON e não DB

State vive no volume do tenant (em `/srv/saas/tenants/<id>/workspace/state/`)
pra ser portável: backup do volume = backup do state; sobreviver a recreate
do container; legível direto via SSH pro diagnostic. Backend de promoção
lê este JSON, não consulta DB pra essa decisão — DB tem o `is_public` flag,
mas a TRILHA do onboarding é responsabilidade do workspace.

## Skill de backend equivalente

Quando a promoção for chamada via API (`POST /api/v1/tenants/{id}/promote`),
o backend lê este JSON pra validar que `promotion.ready=true` e extrair o
`owner_captured.email` pra criar o user. Sem este JSON com `ready=true`, o
endpoint retorna 422 "tenant não passou pelo discovery".
