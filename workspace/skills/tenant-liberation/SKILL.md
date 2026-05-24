---
name: tenant-liberation
description: >
  Gera relatório de prontidão (readiness) do tenant pós-discovery. Roda 3
  níveis de check: universal (Nome/Segmento/Contato), por segmento detectado
  (saúde/alimentação/varejo/etc), e integrações pendentes (que o ADMIN tem
  que resolver fora — WhatsApp Business API, sistemas externos, gateway).
  Esta skill NÃO libera o tenant sozinha — só gera o relatório que o admin
  usa no painel pra decidir manualmente. A liberação real (flip de
  active_profile=public→tenant) é feita pelo backend admin via tool
  set_ui_profile depois que TODAS as pendências forem marcadas resolvidas.
visibility: internal
---

# tenant-liberation

Use esta skill no fim do discovery (após Sofia coletar tudo + delegar
gravação do `memory/empresa.md` ao Rafael).

## Fluxo

### Passo 1 — Gerar relatório de prontidão

Roda o `validate_workspace.py` apontando pro workspace raiz (não o da
Sofia — o raiz onde Rafael gravou `empresa.md`):

```
exec(
  action="run",
  command="python scripts/validate_workspace.py --workspace C:/Users/ruthe/Pictures/pico2/picoclaw/workspace",
  cwd="<caminho desta skill>"
)
```

Em produção tenant: `--workspace /root/.picoclaw/workspace`.

Saída: JSON com:
- `universal`: {nome, segmento, contato_email, contato_whatsapp} → booleans
- `segmento_<chave>`: requisitos específicos do segmento detectado → booleans
- `integracoes_required`: lista de itens que o admin precisa fazer fora
- `missing_summary`: lista flat das pendências
- `ok`: true se TUDO resolvido

### Passo 2 — Avisar o cliente (Sofia)

A Sofia NÃO libera o tenant. Ela só avisa o cliente que mandou o relatório
pro time. Mensagem padrão:

> "Já tenho tudo que precisava do nosso primeiro papo. Mandei o
> resumo pro nosso time avaliar as últimas pendências e fazer as
> integrações que faltam. Em breve liberamos o painel completo
> pra você."

### Passo 3 — Notificar admin

Dispara `notify_user` (vai pro painel adm):

```
notify_user(
  kind="data",
  title="Tenant em discovery: <empresa> pronto pra revisão",
  body="<N> pendências restantes. Veja em adm.jotaduo.com/tenants/discovery",
  agent_id="sofia",
  cta_url="/files/memory/jotaduo/clientes/<slug>.md",
  cta_label="Abrir dossiê"
)
```

## O que NÃO fazer

- **NÃO** chamar `set_ui_profile("tenant")` — isso é decisão exclusiva do
  admin via painel. A tool existe e é usada pelo backend admin (endpoint
  `POST /api/v1/admin/tenants/{id}/discovery-liberate`), não pelo agente.
- **NÃO** prometer prazo de liberação pro cliente — admin faz no ritmo dele.
- **NÃO** rodar este check sem antes ter gravado `memory/empresa.md` raiz
  (via delegate ao Rafael) — o validate lê esse arquivo.

## Para o admin (referência de uso)

O painel `adm.jotaduo.com/tenants/discovery` lista tenants em estado
public, chama `GET /api/v1/admin/tenants/{id}/discovery-status` (que roda
este script no container do tenant), mostra checklist visual. Pra cada
integração na lista `integracoes_required`, admin tem botão
"Marcar resolvida" que chama o backend com `?mark_resolved=<key>` —
internamente isso vira `python validate_workspace.py --mark-resolved <key>`
que escreve em `memory/_meta/integracoes-resolved.json` (sidecar). Próxima
verificação respeita esse sidecar. Quando `ok: true`, admin clica
"LIBERAR TENANT" → backend chama o endpoint que escreve
`ui-visibility.json` com `active_profile: "tenant"`.
