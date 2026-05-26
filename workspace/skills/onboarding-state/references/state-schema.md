# Schema do `workspace/state/onboarding.json`

Arquivo JSON único que serve como state machine do onboarding de um
tenant público até virar tenant cliente.

```json
{
  "phase": "discovery_in_progress | discovery_done | deepening_in_progress | ready_for_promotion | promoted",
  "discovery": {
    "started_at": "2026-05-26T22:30:00Z",
    "completed_at": null,
    "segment": "clinica | restaurante | varejo | servicos | beleza | educacao | imobiliaria | ecommerce | vendas | outro | null",
    "summary": "Resumo executivo do discovery (gerado pela Sofia)",
    "agent": "sofia"
  },
  "deepening": {
    "started_at": null,
    "areas_covered": ["equipe", "casos-excecao"],
    "areas_required": ["equipe", "casos-excecao", "faq", "historico", "regras-tacitas"],
    "completed_at": null,
    "agent": "catarina",
    "forced_completion_reason": null
  },
  "owner_captured": {
    "name": "Eduardo Silva",
    "email": "eduardo@empresa.com.br",
    "whatsapp": "+5511999998888",
    "captured_by": "sofia",
    "captured_at": "2026-05-26T22:55:00Z"
  },
  "promotion": {
    "ready": false,
    "blocked_by": ["deepening_incomplete: faq,historico,regras-tacitas"],
    "promoted_at": null,
    "promoted_by": null
  }
}
```

## Regras de transição

- `phase` é DERIVADO; nunca setado diretamente. Recalculado em toda mutação:
  - `promoted_at != null` → `promoted`
  - `promotion.ready=true` → `ready_for_promotion`
  - `deepening.areas_covered` não-vazio → `deepening_in_progress`
  - `discovery.completed_at != null` → `discovery_done`
  - default → `discovery_in_progress`

- `promotion.ready` vira `true` automaticamente quando:
  1. `discovery.completed_at` não-nulo
  2. `owner_captured.email` não-nulo
  3. Todas as 5 `areas_required` estão em `areas_covered`
  4. `promotion.promoted_at` ainda nulo

- `promotion.blocked_by` lista os motivos da promoção estar bloqueada.
  Lista vazia + `promoted_at=null` = ready.

## Permissões de escrita

- **Sofia** chama: `init`, `set_owner`, `mark_discovery_done`
- **Catarina** chama: `mark_area_complete` (5x, uma por área)
- **Admin** (via painel): `mark_ready_for_promotion` (escape hatch)
- **Backend** (endpoint /promote): `mark_promoted`

## Por que campo separado de `tenants.is_public` no DB

`tenants.is_public` é o estado **do tenant na plataforma** (decide auth mode,
allowed channels, etc.). `onboarding.json.phase` é o estado **da jornada de
cadastro** (o que a equipe de agentes está fazendo). Eles convergem na
promoção, mas servem leitores diferentes:

- Backend gateway lê `is_public` pra decidir auth bypass
- Painel admin lê `onboarding.json` pra decidir mostrar "Promover" ou não
- Sofia/Catarina leem `onboarding.json` pra saber onde estão na jornada
- Backend de promote escreve EM AMBOS quando completa

## Exemplos práticos

### Estado inicial (tenant publico recém-criado)

```json
{
  "phase": "discovery_in_progress",
  "discovery": {"started_at": "...", "completed_at": null, ...},
  "deepening": {"areas_covered": [], ...},
  "owner_captured": {"email": null, ...},
  "promotion": {"ready": false, "blocked_by": ["discovery_incomplete"]}
}
```

### Sofia terminou o discovery e capturou owner

```json
{
  "phase": "discovery_done",
  "discovery": {"completed_at": "...", "segment": "clinica", ...},
  "deepening": {"started_at": "...", "areas_covered": []},
  "owner_captured": {"email": "eduardo@x.com.br", "whatsapp": "...", ...},
  "promotion": {"ready": false, "blocked_by": ["deepening_incomplete: equipe,casos-excecao,faq,historico,regras-tacitas"]}
}
```

### Catarina fechou todas as 5 áreas

```json
{
  "phase": "ready_for_promotion",
  "deepening": {"areas_covered": [...5 áreas...], "completed_at": "..."},
  "promotion": {"ready": true, "blocked_by": []}
}
```

### Tenant promovido pelo admin

```json
{
  "phase": "promoted",
  "promotion": {
    "ready": false,
    "blocked_by": [],
    "promoted_at": "2026-05-26T23:00:00Z",
    "promoted_by": "rutherles@gmail.com"
  }
}
```

(`ready=false` após promoção porque o tenant não é mais promovível — `is_public=false` agora.)
