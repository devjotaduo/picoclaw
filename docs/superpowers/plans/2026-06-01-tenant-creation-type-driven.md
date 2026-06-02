# Type-driven Tenant Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/tenants/new` a single type-driven decision — the workspace
picker disappears, and the chosen type both sets the UI template and is born
with the right agents active (each shown with a description), with Rafael as
a workspace-editing master configurator.

**Architecture:** Three independent, separately-shippable parts.
Part A simplifies the wizard (frontend + thin backend fallback). Part B makes
the type's roster activate `panel_enabled` at provision time (reusing the
proven promote-time mechanism). Part C turns Rafael into a master
configurator. They share the `tenant_types` catalog but do not depend on each
other; ship A→B→C or in any order.

**Tech Stack:** Go (chi, pgx), Postgres migrations, React (TanStack Router),
the existing `internal/saas` provisioning code, `internal/orchestrator`
agent config.

**Key facts confirmed during design (do not re-derive):**
- "Type → UI template" is **already wired**: `runProvision` calls
  `SetUIVisibilityActiveProfile(t.VolumePath, uiProfile)` at
  `internal/saas/tenant/provisioner.go:467-470`, and `uiProfile` comes from
  the catalog via `resolveTenantType` (`internal/saas/api/tenants.go:106-131`).
  Parts here must not break that; Part B adds activation, not template logic.
- Agent activation today = toggling `config.json` `agents[].access.panel_enabled`
  via `applyRecommendedAgentsToConfig` in
  `internal/saas/tenant/recommended_agents.go:261-300`. It only runs on
  **promote**. The togglable id set is `recommendedAgentToggleSet`
  (`recommended_agents.go:38-46`): `clara, luna, marcos, camila, lia, sofia,
  catarina`. `main` (Rafael) is always active.
- `recommendedAgentAliases` (`recommended_agents.go:26-36`) maps `rafael→main`,
  and `NormalizeRecommendedAgentIDs` drops unknown ids. Reuse both.
- `CreateInput.Roster []string` already exists
  (`provisioner.go:275`, passed at `:390`) and feeds the **separate**
  orchestrator role-name path `SetAgentsRoster` → `agents.roster`
  (`provisioner.go:526`, consumed by `EnsureSpecialistConfig`/
  `ensureRosterConfig` in `internal/orchestrator/orchestrator.go:54`). This
  plan does NOT extend that path; Part B adds a distinct `panel_enabled` field.
- The current catalog roster is a flat `["attendant","assistant"]` string array
  (`internal/saas/store/migrations/0021_tenant_types.sql:22,39-47`). Part B
  changes its semantics to objects.

---

## File Structure

| Path | Responsibility | Part |
|---|---|---|
| `internal/saas/store/migrations/0022_tenant_type_rosters.sql` | re-seed `roster_json` with `{id,role,label,desc,locked}` objects | B |
| `internal/saas/tenant/roster_activation.go` (new) | `ActivateRosterAgents(volume, ids)` — shared `panel_enabled` core | B |
| `internal/saas/tenant/recommended_agents.go` | extract shared core, keep promote path | B |
| `internal/saas/tenant/provisioner.go` | new `activeAgentIDs` param; call activation after CopyWorkspaceHome | B |
| `internal/saas/api/tenants.go` | parse roster objects → derive active ids; resolve canonical workspace when none | A + B |
| `internal/saas/api/tenant_roster.go` (new) | `RosterEntry` type + `parseRosterEntries` + `rosterActiveAgentIDs` | A + B |
| `web/frontend/src/routes/admin/tenants/new.tsx` | remove workspace dropdown; render roster preview | A |
| `web/frontend/src/lib/controlplane.ts` | type response carries `roster`; drop `listLauncherProfiles` use here | A |
| `workspace/agents/rafael-assistente-interno.md` | configurator frontmatter + prompt | C |
| `workspace/skills/configurar-workspace/SKILL.md` (new) | guide skill for safe workspace edits | C |

After any `workspace/` edit (Part C): run `make sync-baseline` and
`git restore internal/saas/api/baseline-workspace/cron/jobs.json` before
committing (per memory: baseline cron-sync wart).

---

# PART A — Type-only wizard (kill the workspace picker)

**Outcome:** Operator picks a type card, fills the form, and never sees a
workspace dropdown. A read-only roster preview shows which agents the tenant
will have, each with a description. Server resolves the canonical workspace
automatically.

### Task A1: Backend — resolve canonical workspace when none provided

**Files:**
- Modify: `internal/saas/api/tenants.go:216-226` (after `resolveTenantType`)
- Test: `internal/saas/api/tenants_workspace_fallback_test.go` (new)

Today `handleCreateTenant` only fills `req.WorkspaceID` from the catalog's
`DefaultWorkspaceID` (`tenants.go:224-226`); if both are empty the provisioner
errors (`provisioner.go:345-347`). With the dropdown gone, fall back to the
`is_default_auto` workspace.

- [ ] **Step 1: Write the failing test**

Add a store helper test first — confirm `WorkspaceStore` can fetch the
default-auto row. Inspect `internal/saas/store/workspaces.go` for the exact
method; it sorts `is_default_auto DESC` in `List`. If no
`GetDefaultAuto(ctx)` exists, this task adds one.

```go
// internal/saas/store/workspaces_default_auto_test.go
func TestGetDefaultAutoReturnsMarkedWorkspace(t *testing.T) {
    db := newTestDB(t) // follow existing store test setup in this package
    ws := &Workspace{ID: "ws_a", Name: "canon", IsDefaultAuto: true}
    if err := db.Workspaces().Upsert(context.Background(), ws); err != nil {
        t.Fatal(err)
    }
    got, err := db.Workspaces().GetDefaultAuto(context.Background())
    if err != nil {
        t.Fatalf("GetDefaultAuto: %v", err)
    }
    if got.ID != "ws_a" {
        t.Fatalf("want ws_a, got %s", got.ID)
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `go test ./internal/saas/store/ -run TestGetDefaultAuto -v`
Expected: FAIL (`GetDefaultAuto` undefined) — confirm the method truly
doesn't exist before adding it; if it does, reuse it and skip Step 3.

- [ ] **Step 3: Implement `GetDefaultAuto`**

```go
// internal/saas/store/workspaces.go
// GetDefaultAuto returns the single workspace marked is_default_auto, or
// ErrWorkspaceNotFound when none is marked (tenant creation then fails fast
// with a clear error, matching the existing no-fallback contract).
func (s *WorkspaceStore) GetDefaultAuto(ctx context.Context) (*Workspace, error) {
    q := `SELECT ` + workspaceCols + ` FROM workspaces WHERE is_default_auto = true LIMIT 1`
    w, err := scanWorkspace(s.DB.Pool.QueryRow(ctx, q))
    if errors.Is(err, pgx.ErrNoRows) {
        return nil, ErrWorkspaceNotFound
    }
    return w, err
}
```

(Use the real `workspaceCols`/`scanWorkspace`/`ErrWorkspaceNotFound` names
from `workspaces.go`; adjust if they differ.)

- [ ] **Step 4: Run it to verify it passes**

Run: `go test ./internal/saas/store/ -run TestGetDefaultAuto -v`
Expected: PASS

- [ ] **Step 5: Wire the fallback into the handler**

```go
// internal/saas/api/tenants.go — after the existing block at :224-226
if strings.TrimSpace(req.WorkspaceID) == "" && resolvedType.DefaultWorkspaceID != "" {
    req.WorkspaceID = resolvedType.DefaultWorkspaceID
}
// New: no catalog default → use the canonical is_default_auto workspace so
// the wizard never has to ask. Mirrors the provisioner's "no fallback" error
// when none is marked.
if strings.TrimSpace(req.WorkspaceID) == "" && h.Workspaces != nil {
    if ws, werr := h.Workspaces.GetDefaultAuto(r.Context()); werr == nil {
        req.WorkspaceID = ws.ID
    } else if !errors.Is(werr, store.ErrWorkspaceNotFound) {
        writeError(w, http.StatusInternalServerError, "db error")
        return
    }
}
```

- [ ] **Step 6: Test the handler fallback**

```go
// internal/saas/api/tenants_workspace_fallback_test.go
// Build a Handler with a fake Workspaces store returning a default-auto ws and
// a fake Provisioner that records the WorkspaceID it received. POST a create
// request with no workspace_id and tenant_type="cliente"; assert the
// provisioner saw the default-auto id. Follow the handler-test harness already
// used in this package (grep for httptest.NewRequest in internal/saas/api).
```

Run: `go test ./internal/saas/api/ -run WorkspaceFallback -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add internal/saas/store/workspaces.go internal/saas/store/workspaces_default_auto_test.go internal/saas/api/tenants.go internal/saas/api/tenants_workspace_fallback_test.go
git commit -m "saas: resolve canonical workspace when wizard sends none"
```

### Task A2: Frontend — remove the workspace dropdown

**Files:**
- Modify: `web/frontend/src/routes/admin/tenants/new.tsx` (workspace `<select>` ~299-317; the `listLauncherProfiles()` query ~100)
- Modify: `web/frontend/src/lib/controlplane.ts` (only if `listLauncherProfiles` becomes unused after this + A3)

- [ ] **Step 1: Delete the workspace select + its data load**

Remove the `<select id="t-ws">` block (≈ lines 299-317) and the
`workspaces` query that calls `listLauncherProfiles()` (≈ line 100). Remove
`workspace_id` from the create payload (the server now resolves it). Leave
everything else (name, subdomain, owner_email, advanced, test-mode) intact.

- [ ] **Step 2: Typecheck + build**

Run: `cd web/frontend && pnpm build`
Expected: builds clean, no unused-symbol errors. If `listLauncherProfiles`
is now unused project-wide, remove it from `controlplane.ts`; if other admin
screens still use it, leave it.

- [ ] **Step 3: Commit**

```bash
git add web/frontend/src/routes/admin/tenants/new.tsx web/frontend/src/lib/controlplane.ts
git commit -m "frontend: remove workspace dropdown from new-tenant wizard"
```

### Task A3: Frontend — roster preview from the type

**Files:**
- Modify: `web/frontend/src/routes/admin/tenants/new.tsx`
- Modify: `web/frontend/src/lib/controlplane.ts` (`TenantType` shape carries `roster`)

The tenant-type response already exposes `roster` (`tenant_types.go:24,40`).
After Part B re-seeds it with objects, each entry is
`{id, role, label, desc, locked}`. Render them as read-only cards in Step 2
of the wizard, under the form, for the currently-selected type.

- [ ] **Step 1: Extend the `TenantType` TS type**

```ts
// controlplane.ts
export interface RosterEntry {
  id: string;
  role: "master" | "atendente" | "especialista" | "discovery";
  label: string;
  desc: string;
  locked?: boolean;
}
export interface TenantType {
  // ...existing fields...
  roster?: RosterEntry[];
}
```

- [ ] **Step 2: Render the preview**

In the type's Step-2 panel, map `selectedType.roster` to a list. Each row:
`label` (bold) + `desc` (muted). `locked` rows get a small "fixo" badge.
No checkboxes in v1 (read-only — decided during design). Empty/undefined
roster renders nothing (publico/admin).

```tsx
{selectedType?.roster?.length ? (
  <div className="roster-preview">
    <h4>Agentes deste tipo</h4>
    {selectedType.roster.map((a) => (
      <div key={a.id} className="roster-row">
        <span className="roster-label">{a.label}</span>
        {a.locked ? <span className="badge">fixo</span> : null}
        <p className="roster-desc">{a.desc}</p>
      </div>
    ))}
  </div>
) : null}
```

- [ ] **Step 3: Build**

Run: `cd web/frontend && pnpm build`
Expected: clean build. (Before Part B ships, `roster` arrives as legacy
string array → the `.map` would render `undefined` labels; that's fine
because the type panel is only fully exercised after Part B re-seeds. If
shipping A before B, guard: `typeof a === "object" && a.label`.)

- [ ] **Step 4: Commit**

```bash
git add web/frontend/src/routes/admin/tenants/new.tsx web/frontend/src/lib/controlplane.ts
git commit -m "frontend: show per-type agent roster preview in wizard"
```

---

# PART B — Born configured (activate roster at provision)

**Outcome:** Creating a `clinica` tenant yields `rafael(main)+clara+camila`
active in the panel and the rest hidden, recorded in
`workspace/config/agent-activation.json`, without any promote step. Público
stays untouched (Sofia solo).

### Task B1: Extract a shared activation core

**Files:**
- Modify: `internal/saas/tenant/recommended_agents.go`
- Create: `internal/saas/tenant/roster_activation.go`
- Test: `internal/saas/tenant/roster_activation_test.go`

Refactor so promote (id list from onboarding.json) and provision (id list
from the type roster) share one core. Keep `ActivateRecommendedAgents`'s
public signature and behavior; it just delegates.

- [ ] **Step 1: Write the failing test for the new entry point**

```go
// internal/saas/tenant/roster_activation_test.go
func TestActivateRosterAgentsTogglesOnlyListed(t *testing.T) {
    vol := writeConfigWithAgents(t, []string{"main", "clara", "marcos", "camila", "lia"})
    res, err := ActivateRosterAgents(vol, []string{"clara", "camila"})
    if err != nil {
        t.Fatalf("ActivateRosterAgents: %v", err)
    }
    if !res.Applied {
        t.Fatalf("expected Applied")
    }
    cfg := readConfig(t, vol)
    assertPanelEnabled(t, cfg, "clara", true)
    assertPanelEnabled(t, cfg, "camila", true)
    assertPanelEnabled(t, cfg, "marcos", false)
    assertPanelEnabled(t, cfg, "lia", false)
}
```

(Reuse/define `writeConfigWithAgents`, `readConfig`, `assertPanelEnabled`
mirroring the fixtures in `recommended_agents_test.go`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `go test ./internal/saas/tenant/ -run TestActivateRosterAgents -v`
Expected: FAIL (`ActivateRosterAgents` undefined)

- [ ] **Step 3: Implement the shared core + new entry point**

```go
// internal/saas/tenant/roster_activation.go
package tenant

// ActivateRosterAgents toggles config.json panel_enabled so exactly the given
// agent ids (plus always-on main) are active in the panel. Ids are normalized
// (rafael→main, unknowns dropped) via the same rules as the promote path.
// Empty ids is a fail-open no-op (public tenants pass nil → Sofia stays solo).
// source is recorded in the agent-activation.json audit artifact.
func ActivateRosterAgents(volumePath string, ids []string) (RecommendedAgentsActivationResult, error) {
    return activateAgents(volumePath, NormalizeRecommendedAgentIDs(ids), "tenant_type")
}
```

Then extract the body of the existing `ActivateRecommendedAgents`
(`recommended_agents.go:68-133`) into `activateAgents(volumePath string,
recommended []string, source string)`, and rewrite the original to:

```go
func ActivateRecommendedAgents(volumePath string) (RecommendedAgentsActivationResult, error) {
    recommended, source, err := readRecommendedAgents(volumePath)
    if err != nil {
        return RecommendedAgentsActivationResult{}, err
    }
    return activateAgents(volumePath, recommended, source)
}
```

`activateAgents` keeps the existing fail-open branches (`no_recommended_agents`,
`config_json_missing`, `agents_list_missing`), the `applyRecommendedAgentsToConfig`
call, and `writeRecommendedAgentsAudit`. Only change: `source` is a parameter,
and the `len(recommended)==0` no-op stays.

- [ ] **Step 4: Run the whole package**

Run: `go test ./internal/saas/tenant/ -run 'Activate' -v`
Expected: PASS — both the new test and the unchanged
`recommended_agents_test.go` suite (TestActivateRecommendedAgents*).

- [ ] **Step 5: Commit**

```bash
git add internal/saas/tenant/roster_activation.go internal/saas/tenant/recommended_agents.go internal/saas/tenant/roster_activation_test.go
git commit -m "saas: extract shared agent-activation core (promote + provision)"
```

### Task B2: Call activation in the provisioner

**Files:**
- Modify: `internal/saas/tenant/provisioner.go` (`CreateInput`, `Create`, `runProvision`)
- Test: `internal/saas/tenant/provisioner_roster_activation_test.go`

- [ ] **Step 1: Add the field + param (no behavior yet)**

Add to `CreateInput` (after `Roster []string`, `provisioner.go:275`):

```go
// ActiveAgentIDs are the workspace agent ids (clara, marcos, camila, lia,
// rafael→main, ...) the tenant is born with active in the panel. Derived from
// the tenant type's roster. Empty for publico/admin (no activation; Sofia/
// admin baseline untouched).
ActiveAgentIDs []string
```

Thread it through `Create` (pass `in.ActiveAgentIDs` into `runProvision`)
and add a matching parameter to `runProvision`'s signature
(`provisioner.go:411-421`).

- [ ] **Step 2: Write the failing integration test**

```go
// internal/saas/tenant/provisioner_roster_activation_test.go
// Use the existing provisioner test scaffolding (grep runProvision tests in
// this package). Provision a tenant with ActiveAgentIDs=["clara","camila"]
// against a workspace whose home/config.json lists main/clara/marcos/camila/lia.
// Assert agent-activation.json in the volume has active_agents containing
// main, clara, camila and hidden_agents containing marcos, lia.
```

Run: `go test ./internal/saas/tenant/ -run ProvisionRosterActivation -v`
Expected: FAIL (activation not called yet)

- [ ] **Step 3: Call activation after the UI-profile step**

In `runProvision`, inside the `if !ws.IsRaw {` block (after `SetAgentsRoster`,
`provisioner.go:526-528`), add:

```go
// 1e. Born-configured activation (v2.0). Toggle panel_enabled so the tenant
// type's roster is active from first boot — the same mechanism promote uses,
// run at create time. No-op for empty ids (public/admin keep their baseline).
if len(activeAgentIDs) > 0 {
    if _, err = ActivateRosterAgents(t.VolumePath, activeAgentIDs); err != nil {
        return fmt.Errorf("activate roster agents: %w", err)
    }
}
```

(Use the param name you chose in Step 1.)

- [ ] **Step 4: Run it to verify it passes**

Run: `go test ./internal/saas/tenant/ -run ProvisionRosterActivation -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/saas/tenant/provisioner.go internal/saas/tenant/provisioner_roster_activation_test.go
git commit -m "saas: activate tenant-type roster at provision (born configured)"
```

### Task B3: Roster object type + handler wiring

**Files:**
- Create: `internal/saas/api/tenant_roster.go`
- Modify: `internal/saas/api/tenants.go:227-235,345-360`
- Test: `internal/saas/api/tenant_roster_test.go`

- [ ] **Step 1: Write the failing parser test**

```go
// internal/saas/api/tenant_roster_test.go
func TestRosterActiveAgentIDs(t *testing.T) {
    raw := json.RawMessage(`[
      {"id":"rafael","role":"master","label":"Rafael","desc":"x","locked":true},
      {"id":"clara","role":"atendente","label":"Clara","desc":"y","locked":true},
      {"id":"camila","role":"especialista","label":"Camila","desc":"z"}
    ]`)
    ids, err := rosterActiveAgentIDs(raw)
    if err != nil {
        t.Fatalf("rosterActiveAgentIDs: %v", err)
    }
    // rafael normalizes to main downstream; here we keep raw ids, dedup order-preserving
    want := []string{"rafael", "clara", "camila"}
    if !reflect.DeepEqual(ids, want) {
        t.Fatalf("want %v got %v", want, ids)
    }
}

func TestRosterActiveAgentIDsLegacyStringArrayIsEmpty(t *testing.T) {
    // ["attendant","assistant"] (pre-0022) carry no agent ids → no activation
    ids, err := rosterActiveAgentIDs(json.RawMessage(`["attendant","assistant"]`))
    if err != nil || len(ids) != 0 {
        t.Fatalf("legacy roster should yield no ids, got %v err %v", ids, err)
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `go test ./internal/saas/api/ -run TestRosterActiveAgentIDs -v`
Expected: FAIL (undefined)

- [ ] **Step 3: Implement the type + parser**

```go
// internal/saas/api/tenant_roster.go
package api

import (
    "encoding/json"
    "strings"
)

// RosterEntry is one agent spec in a tenant_types.roster_json (v2.0 object
// form). The legacy flat ["attendant","assistant"] form decodes to entries
// with empty Id, which carry no panel activation.
type RosterEntry struct {
    ID     string `json:"id"`
    Role   string `json:"role"`
    Label  string `json:"label"`
    Desc   string `json:"desc"`
    Locked bool   `json:"locked"`
}

// rosterActiveAgentIDs extracts the ordered, de-duplicated agent ids from a
// roster_json blob. Tolerates the legacy string-array form (yields no ids).
func rosterActiveAgentIDs(raw json.RawMessage) ([]string, error) {
    if len(raw) == 0 {
        return nil, nil
    }
    var entries []RosterEntry
    if err := json.Unmarshal(raw, &entries); err != nil {
        // legacy ["attendant","assistant"] → not objects → no agent ids
        var legacy []string
        if json.Unmarshal(raw, &legacy) == nil {
            return nil, nil
        }
        return nil, err
    }
    seen := map[string]bool{}
    out := make([]string, 0, len(entries))
    for _, e := range entries {
        id := strings.ToLower(strings.TrimSpace(e.ID))
        if id == "" || seen[id] {
            continue
        }
        seen[id] = true
        out = append(out, id)
    }
    return out, nil
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `go test ./internal/saas/api/ -run TestRosterActiveAgentIDs -v`
Expected: PASS

- [ ] **Step 5: Wire into the create handler**

Replace the roster parse block at `tenants.go:227-235`:

```go
// Active agents for this tenant type (object roster, v2.0). Legacy string
// rosters yield no ids → no activation, preserving current behavior.
activeAgentIDs, err := rosterActiveAgentIDs(resolvedType.Roster)
if err != nil {
    writeError(w, http.StatusBadRequest, "roster do tipo de tenant está malformado")
    return
}
```

Remove the now-unused `var roster []string` / `Roster: roster` plumbing IF
nothing else needs it; otherwise leave `Roster` empty and add the new field.
In the `CreateInput{...}` literal (`tenants.go:345-360`) add:

```go
ActiveAgentIDs: activeAgentIDs,
```

Keep `Roster:` as-is (empty for object rosters) so the orchestrator
role-name path is untouched.

- [ ] **Step 6: Build + vet**

Run: `go build ./... && go vet ./internal/saas/...`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add internal/saas/api/tenant_roster.go internal/saas/api/tenant_roster_test.go internal/saas/api/tenants.go
git commit -m "saas: derive active agent ids from tenant-type roster"
```

### Task B4: Migration — re-seed rosters with objects

**Files:**
- Create: `internal/saas/store/migrations/0022_tenant_type_rosters.sql`
- Test: `internal/saas/store/migrations_test.go` (if one exists; else manual)

- [ ] **Step 1: Write the migration**

```sql
-- internal/saas/store/migrations/0022_tenant_type_rosters.sql
-- v2.0: enrich tenant_types.roster_json from the flat ["attendant","assistant"]
-- placeholder to object specs {id,role,label,desc,locked} so each type carries
-- the named agents it is born with (panel_enabled at provision) and the wizard
-- can show a per-agent description. Idempotent UPDATEs by slug; publico keeps
-- Sofia solo, admin/cliente get the rafael+clara default.

UPDATE tenant_types SET roster_json = '[
  {"id":"sofia","role":"discovery","label":"Sofia — Discovery","desc":"Conduz a descoberta com o visitante anônimo.","locked":true}
]' WHERE slug = 'publico';

UPDATE tenant_types SET roster_json = '[]' WHERE slug = 'admin';

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende clientes no WhatsApp: triagem, dúvidas e encaminhamento.","locked":true}
]' WHERE slug IN ('cliente', 'atendimento-geral');

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende pacientes no WhatsApp: triagem, dúvidas e agendamento.","locked":true},
  {"id":"camila","role":"especialista","label":"Camila — Pós-atendimento","desc":"Lembretes de consulta, confirmações e retorno de pacientes."}
]' WHERE slug = 'clinica';

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende clientes no WhatsApp: triagem, dúvidas e suporte.","locked":true},
  {"id":"marcos","role":"especialista","label":"Marcos — Vendas","desc":"Qualifica leads, apresenta catálogo e fecha vendas."}
]' WHERE slug IN ('loja', 'restaurante', 'imobiliaria');

UPDATE tenant_types SET roster_json = '[
  {"id":"rafael","role":"master","label":"Rafael — Assistente configurador","desc":"Conversa com você e altera todo o workspace: agentes, skills, textos, visibilidade.","locked":true},
  {"id":"clara","role":"atendente","label":"Clara — Atendente","desc":"Atende clientes no WhatsApp: triagem, agendamento e dúvidas.","locked":true},
  {"id":"marcos","role":"especialista","label":"Marcos — Vendas","desc":"Qualifica leads e fecha orçamentos."},
  {"id":"lia","role":"especialista","label":"Lia — Marketing","desc":"Posts, campanhas e materiais visuais para divulgação."}
]' WHERE slug = 'servicos';
```

- [ ] **Step 2: Apply against a scratch DB and verify**

Run the SaaS migration runner against a throwaway Postgres (follow
`docs/operations/saas-vps-deploy.md` / how `store.Migrate` is invoked in
tests). Then:

```sql
SELECT slug, roster_json FROM tenant_types WHERE slug IN ('publico','clinica','servicos');
```

Expected: object arrays as written; `publico` = sofia only.

- [ ] **Step 3: Confirm the API still serves it**

`GET /api/v1/tenant-types?selectable=true` → each type's `roster` is the
object array (no Go change needed: `Roster json.RawMessage` passes through).

- [ ] **Step 4: Commit**

```bash
git add internal/saas/store/migrations/0022_tenant_type_rosters.sql
git commit -m "saas: re-seed tenant-type rosters as named-agent objects"
```

### Task B5: End-to-end check

- [ ] **Step 1: Create a clinica tenant locally**

Bring up the dev SaaS stack (per CLAUDE.md docker compose dev command).
Create a tenant with `tenant_type=clinica`, no workspace_id.

- [ ] **Step 2: Assert born-configured**

In the new tenant volume:
- `workspace/config/agent-activation.json` → `active_agents` contains
  `main, clara, camila`; `hidden_agents` contains `lia, marcos`; `source` =
  `tenant_type`.
- `ui-visibility.json` `active_profile` = `tenant`.

- [ ] **Step 3: Público regression**

Create `tenant_type=publico` → no activation artifact change, Sofia solo,
`active_profile=public`, no owner_email required. Confirm the public funnel
path is byte-for-byte unchanged.

---

# PART C — Rafael, master configurator

**Outcome:** Rafael can edit the entire tenant workspace from chat (agents,
skills, prompts, UI profile), scoped to the tenant's own workspace.

### Task C1: New guide skill `configurar-workspace`

**Files:**
- Create: `workspace/skills/configurar-workspace/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: configurar-workspace
description: Use quando o dono pedir para mudar agentes, skills, textos, identidade ou visibilidade do workspace. Guia Rafael a editar AGENT.md, SOUL.md, behavior.json e config.json com segurança.
visibility: interno
---

# Configurar o workspace

Você é o configurador master. Edite os arquivos do workspace do tenant a
pedido do dono. Sempre: leia o arquivo, faça a mudança mínima, valide, grave.

## Esquema de um agente (workspace/agents/<id>/AGENT.md ou <id>.md)
Frontmatter YAML:
- `name:` nome de exibição (obrigatório)
- `role:` função (obrigatório)
- `visibility:` interno | atendimento | comercial | suporte | global
- `skills:` lista YAML de skills que o agente pode usar (opcional)
- `tools:` lista YAML de tools permitidas (opcional)
- `model:` modelo (opcional)
Nunca apague um campo obrigatório. Nunca invente uma skill que não existe em
workspace/skills/.

## Ligar/desligar um agente no painel
Em config.json, cada entry de `agents.list[]` tem `access.panel_enabled`
(bool). Ligue/desligue só os ids togláveis: clara, luna, marcos, camila, lia,
sofia, catarina. `main` (você, Rafael) fica sempre ligado.

## Identidade e tom (SOUL.md) e filtros (behavior.json)
SOUL.md = identidade/personalidade/voz. behavior.json = switches de negócio
(master_enabled, respond_in_dm, etc.). Mude um de cada vez e explique ao dono
o efeito antes de gravar.

## Template de UI
Use a tool set_ui_profile para alternar entre public/tenant/admin/waiting/test
apenas quando o dono pedir mudança de modo do painel.
```

- [ ] **Step 2: Commit**

```bash
git add workspace/skills/configurar-workspace/SKILL.md
git commit -m "skill: add configurar-workspace guide for Rafael"
```

### Task C2: Grant Rafael the configurator skills + tools

**Files:**
- Modify: `workspace/agents/rafael-assistente-interno.md`

Note: confirm the runtime reads `skills:`/`tools:` from AGENT.md frontmatter
for this agent. If the launcher agent loader ignores frontmatter tool
allowlists and tools are granted elsewhere (config.json `agents.list[].skills`
/ tool registry), apply the grant there instead — grep
`pkg/agent` for where an agent's tool allowlist is assembled and mirror the
pattern an already-tool-rich agent (e.g. `operador`) uses.

- [ ] **Step 1: Update Rafael's frontmatter**

```yaml
---
name: Rafael
role: Assistente configurador
visibility: interno
skills:
  - consultar-memoria
  - atualizar-memoria
  - skill-creator
  - tenant-liberation
  - onboarding-state
  - configurar-workspace
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

Add a short prompt section below the frontmatter describing the configurator
role (edits the workspace on the owner's behalf; reads before writing;
explains effects; never touches secrets/sessions/other tenants).

- [ ] **Step 2: Verify the file tools are workspace-scoped**

Confirm Rafael's agent instance runs with `RestrictToWorkspace=true` and
`AllowReadOutsideWorkspace=false` (the launcher's default for tenant agents —
check `pkg/agent/instance.go` wiring and how tenant agents are constructed).
This is the trust boundary; do not loosen it. If the configurator agent isn't
restricted, that's a blocker — stop and surface it before granting write tools.

- [ ] **Step 3: Confirm `tenant_manager` gating keys off role, not name**

Grep the `tenant_manager` tool (`pkg/tools/`) for its "Assistante-only" gate.
Confirm Rafael (the assistente) passes it and that destructive ops still
require the confirmation flag. If the gate is a hardcoded agent name other
than Rafael's id, adjust it to key off the assistant role.

- [ ] **Step 4: Sync baseline + commit**

```bash
make sync-baseline
git restore internal/saas/api/baseline-workspace/cron/jobs.json   # baseline cron-sync wart
git add workspace/agents/rafael-assistente-interno.md internal/saas/api/baseline-workspace/
git commit -m "agent: make Rafael a workspace-scoped master configurator"
```

### Task C3: Smoke-test Rafael

- [ ] **Step 1: Manual chat smoke**

In a dev `cliente` tenant panel, message Rafael: "desligue a Lia e mude o tom
da Clara para mais formal". Confirm he (a) toggles `lia.access.panel_enabled`
false in config.json, (b) edits Clara's SOUL/AGENT for tone, (c) does not
escape the workspace dir. Capture the agent-activation/file diffs as proof.

---

## Final verification (all parts)

- [ ] `make check` (deps + fmt + vet + test + lint-docs) green.
- [ ] `cd web/frontend && pnpm build` green.
- [ ] Público funnel unchanged (Part B5 Step 3).
- [ ] No workspace dropdown in the wizard; roster preview renders per type.
- [ ] A freshly created vertical tenant is born with the right agents active.

## Self-review notes (filled during planning)

- **Spec coverage:** single-workspace (A1 fallback + A2 dropdown removal),
  roster-in-DB (B4), activation-at-provision (B1–B3), type→template
  (already wired — noted, no task needed beyond regression B5.3), Rafael
  master (C1–C3), público special-case (B4 sofia-only + B5.3 regression). All
  spec sections map to tasks.
- **Decisions locked:** read-only roster preview in v1 (no checkboxes);
  object roster drives `panel_enabled` only, NOT the orchestrator
  `agents.roster` role-name path (left untouched to avoid the two-vocabulary
  tangle); `rafael→main` normalization reused from the promote path.
- **Open runtime confirmations folded into tasks (not guesses):** AGENT.md
  frontmatter tool/skill loading (C2.1 note), workspace-scope restriction
  (C2.2 blocker check), `tenant_manager` gate keying (C2.3).
