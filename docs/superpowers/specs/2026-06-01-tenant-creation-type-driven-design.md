# Type-driven tenant creation — kill the workspace picker

**Date:** 2026-06-01
**Status:** Design — approved direction, pending spec review
**Area:** SaaS tenant provisioning (`internal/saas/`, `web/frontend/src/routes/admin/tenants/`, `workspace/agents/rafael`)

## Problem

The `/tenants/new` wizard has **two competing selectors** that confuse the
operator:

1. A **type card** (Público / Admin / Cliente + catalog verticals).
2. A **workspace dropdown** (`listLauncherProfiles()`), the "worktree" the
   user wants to kill.

Choosing both is redundant and error-prone: the type already implies what
the tenant should be, but the operator still has to guess which workspace
goes with it. Worse, agent activation only happens on **promote** (the
public funnel), so a directly-created `cliente` tenant is born with the
wrong/empty agent set and has to be configured by hand.

## Goals

- One canonical workspace. The wizard never asks which workspace to use.
- The **type** is the single decision: it determines the UI template
  (ui-visibility profile) **and** the roster of agents that are born active.
- Every non-public tenant is born **already configured**: a master
  configurator agent (Rafael) + a public attendant (Clara) + the vertical's
  specialists, each shown with a human description in the wizard.
- Público keeps its current behavior unchanged (Sofia discovery flow).
- Rafael becomes a real **master configurator**: he can edit the entire
  tenant workspace (agents, skills, prompts, UI profile) from chat.

## Non-goals

- Not removing clone / per-workspace frontend / advanced workspace ops —
  those keep their existing separate paths. Only **new tenant creation** is
  locked to the canonical workspace.
- Not redesigning the public promotion funnel. The `/promote` path and its
  `ActivateRecommendedAgents` source (onboarding.json/empresa.md) stay; we
  only **generalize** activation so it can also be driven by a type roster.
- Not building a visual agent-editor UI for Rafael — he edits via tools.

## The model

```
                 ┌─────────────────────────────────────┐
                 │   ONE canonical workspace            │
                 │   (is_default_auto)                  │
                 │   contains ALL agent definitions:    │
                 │   Rafael, Clara, Marcos, Camila,     │
                 │   Lia, Sofia, Catarina, ...          │
                 └──────────────┬──────────────────────┘
                                │ CopyWorkspaceHome
                                ▼
   tenant_type ──┬─ ui_profile ───▶ SetUIVisibilityActiveProfile (template)
                 │
                 └─ roster ────────▶ ApplyRoster: panel_enabled=true for
                                     roster agents, hidden for the rest
                                            │
                                            ▼
                                   tenant born already configured
```

The type does not pick a workspace. It picks **which agents of the single
workspace are active** and **which UI template renders**.

### Invariant: the default roster

Every **non-public** type's roster always includes, locked:

- `rafael` — `role: master` — the configurator (always active; he is the
  `main` agent and is never togglable).
- `clara` — `role: atendente` — the public-facing attendant.

What **varies** per vertical is only the specialist list:

| Type          | ui_profile | Roster (beyond rafael + clara)            |
|---------------|-----------|-------------------------------------------|
| `publico`     | public    | `sofia` only (special path, see below)    |
| `admin`       | admin     | (admin profile; roster minimal)           |
| `cliente`     | tenant    | — (just rafael + clara)                    |
| `clinica`     | tenant    | `camila` (pós-atendimento / lembretes)    |
| `loja`        | tenant    | `marcos` (vendas)                          |
| `restaurante` | tenant    | `marcos`                                   |
| `imobiliaria` | tenant    | `marcos`                                   |
| `servicos`    | tenant    | `marcos`, `lia` (marketing)                |

(Specialist assignments above are the seed default; admin-editable later.)

**Público is special.** Its roster is `[sofia]` and it keeps 100% of the
current flow: `IsPublic=true`, no owner_email, `SkipDashboardPassword`,
`publicSofiaAgentMD`. The roster machinery must not interfere with the
public path — for `publico` we set roster=`[sofia]` and otherwise leave the
existing provisioning branch untouched.

## Data model

`tenant_types.roster_json` (column already exists, migration `0021`) is
enriched from a flat `["attendant","assistant"]` array to an array of
objects:

```jsonc
// tenant_types.roster_json for "clinica"
[
  { "id": "rafael", "role": "master",      "label": "Rafael — Assistente configurador",
    "desc": "Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.",
    "locked": true },
  { "id": "clara",  "role": "atendente",   "label": "Clara — Atendente",
    "desc": "Atende clientes no WhatsApp: triagem, dúvidas, agendamento.",
    "locked": true },
  { "id": "camila", "role": "especialista", "label": "Camila — Pós-atendimento",
    "desc": "Lembretes de consulta, confirmações e retorno de pacientes." }
]
```

Field semantics:

- `id` — agent id matching `config.json agents[].id` / the togglable set in
  `recommended_agents.go`.
- `role` — `master` | `atendente` | `especialista` | `discovery`. Drives
  ordering and which entries the wizard locks.
- `label` / `desc` — shown in the wizard roster preview.
- `locked` (bool) — `true` for rafael/clara; the wizard cannot uncheck
  them.

A new migration (`0022_tenant_type_rosters.sql`) re-seeds `roster_json` for
the system + vertical types with the objects above. `is_system` rows
(publico/admin/cliente) keep being protected from deletion.

## Provisioning changes

`Provisioner.runProvision` gains one step right after `CopyWorkspaceHome`
(mirrors where `SetUIVisibilityActiveProfile` already runs):

1. Resolve the chosen `tenant_type` row → `{ ui_profile, roster }`.
2. `SetUIVisibilityActiveProfile(volume, ui_profile)` — **the type's
   `ui_profile` is now the single source of truth** for the template,
   replacing the parallel hardcoded `resolveUIProfile` switch (which stays
   only as a fallback for legacy callers without a catalog row).
3. `ApplyRoster(volume, roster)` — generalized form of
   `ActivateRecommendedAgents`: toggles `config.json
   agents[].access.panel_enabled` true for roster ids, hidden for the rest.
   Writes the same `workspace/config/agent-activation.json` audit artifact
   with `source: "tenant_type"`.

`ActivateRecommendedAgents` is refactored so the existing promote path and
the new provision path share one core function that takes an explicit list
of agent ids + a source tag. Promote keeps reading
onboarding.json/empresa.md; provision reads the type roster.

## Rafael — master configurator

### Frontmatter (`workspace/agents/rafael-assistente-interno.md`)

```yaml
---
name: Rafael
role: Assistente configurador
visibility: interno        # + reachable in the owner panel chat (see below)
skills:
  - consultar-memoria
  - atualizar-memoria
  - skill-creator
  - tenant-liberation
  - onboarding-state
  - configurar-workspace   # new guide skill
tools:
  - read_file
  - write_file
  - edit_file
  - list_dir
  - set_ui_profile
  - tenant_manager
  - propose_attendant_config
  - notify_user
---
```

- File tools stay scoped by the existing `RestrictToWorkspace` /
  `AllowReadOutsideWorkspace=false` on the agent instance — Rafael can only
  write inside the tenant's own workspace. This is the same trust boundary
  the launcher's agent-editor UI already grants the owner.
- `tenant_manager` is currently gated "Assistante-only". Rafael **is** the
  assistente, so this is a designation, not a privilege escalation across
  the tenant boundary — confirm the gate keys off the agent role, not a
  hardcoded name.
- **Visibility:** Rafael must be reachable in the tenant owner's panel chat
  (he is the configurator the owner talks to), while staying off
  customer-facing channels. Verify the panel/owner chat surface is included
  in `interno` or add an `owner` surface; do not expose Rafael on WhatsApp
  to end customers.

### New skill: `configurar-workspace`

A guide skill (visibility: interno) documenting, for Rafael:

- The AGENT.md frontmatter schema (name/role/visibility/skills/tools/model)
  and the optional fields.
- How to safely edit `AGENT.md`, `SOUL.md`, `behavior.json` (read → modify
  → validate → write; never blank a required field).
- The agent ids known to the togglable set and how `panel_enabled` works.
- Which UI profiles exist and what `set_ui_profile` does.

No new Go tool is required — Rafael composes existing tools.

## Wizard UI (`web/frontend/src/routes/admin/tenants/new.tsx`)

- **Step 1 (type cards):** unchanged in spirit. Cards come from the catalog
  (`listTenantTypes(true)`) plus the system types. Each card's tagline/
  bullets can be derived from the type's `description` + roster size.
- **Step 2 (form):**
  - Keep: display name, subdomain, owner_email (hidden for `publico`),
    advanced (budget/memory/cpu), test-mode block.
  - **Remove:** the workspace `<select>` (lines ~299–317) and the
    `listLauncherProfiles()` load. Creation always uses the canonical
    workspace server-side.
  - **Add: roster preview.** Render the chosen type's `roster` as a list of
    agent cards — `label` + `desc` beside each. `locked` entries
    (rafael/clara) render as fixed/checked-disabled. Specialist entries
    render as checkboxes, all checked by default; unchecking removes the id
    from the roster sent to the API. (Polish — if we want to ship leaner,
    v1 can be read-only preview with no checkboxes; default all-on.)
- The create request sends `tenant_type` (already) and, if checkboxes are
  enabled, the effective roster ids. Server falls back to the type's full
  roster when none sent.

## Files touched

| Layer | File | Change |
|---|---|---|
| Migration | `internal/saas/store/migrations/0022_tenant_type_rosters.sql` | re-seed `roster_json` with `{id,role,label,desc,locked}` objects |
| Store | `internal/saas/store/tenant_types.go` | roster struct decode (objects, not strings) |
| API | `internal/saas/api/tenant_types.go` | expose enriched roster in response |
| Provision | `internal/saas/tenant/provisioner.go` | apply roster + type ui_profile after CopyWorkspaceHome |
| Activation | `internal/saas/tenant/recommended_agents.go` | extract shared `ApplyRoster(ids, source)`; promote + provision both call it |
| Agent | `workspace/agents/rafael-assistente-interno.md` | configurator frontmatter (skills/tools) + prompt section |
| Skill | `workspace/skills/configurar-workspace/SKILL.md` | new guide skill |
| Frontend | `web/frontend/src/routes/admin/tenants/new.tsx` | remove workspace dropdown; add roster preview |
| Controlplane client | `web/frontend/src/lib/controlplane.ts` | type response carries roster; drop launcher-profiles use in this flow |
| Baseline | `internal/saas/api/baseline-workspace/` | `make sync-baseline` after workspace edits |

## Security considerations

- Rafael's write power is bounded to the tenant's own workspace via the
  existing instance restriction — he cannot read/write across tenants or
  outside the home. Reviewer must confirm `RestrictToWorkspace` is on for
  the configurator agent and that file tools honor it (this repo has a
  cited prior sandbox-escape incident — file-path handling gets extra
  scrutiny per CONTRIBUTING).
- `tenant_manager` must remain confirmation-gated for destructive ops.
- The roster activation writes only `panel_enabled` flags + the audit
  artifact; it must never touch secrets, sessions, or other tenants.

## Testing

- Unit: `ApplyRoster` toggles the right ids; público roster=`[sofia]`
  leaves the public branch untouched; unknown roster id is rejected like
  the existing recommended-agents path.
- Unit: type → ui_profile resolution comes from the catalog row; legacy
  callers still get the `resolveUIProfile` fallback.
- Provision integration: create a `clinica` tenant → assert
  agent-activation.json lists `rafael, clara, camila` active; ui-visibility
  active_profile = `tenant`.
- Frontend: wizard renders roster preview for a vertical; no workspace
  dropdown present; publico hides owner_email.
- `make check` (deps + fmt + vet + test + lint-docs) green.

## Open questions / deferred

- Whether to ship the specialist checkboxes in v1 or start read-only.
  (Leaning read-only preview first, checkboxes as fast-follow.)
- Exact owner-chat visibility surface for Rafael (reuse `interno` vs new
  `owner`) — resolve during implementation against the channel/visibility
  code.
