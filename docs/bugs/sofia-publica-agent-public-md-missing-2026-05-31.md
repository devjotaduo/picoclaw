# Root cause — "Falha ao criar cliente" público: AGENT.public.md ausente (2026-05-31)

## Erro (screenshot do admin, criando tenant `soso`, Modelo base = "Publico · v1")
```
apply public sofia AGENT.md: read public Sofia prompt agents/sofia/AGENT.public.md:
open /srv/saas/tenants/soso-38ba74/workspace/agents/sofia/AGENT.public.md: no such file or directory
```

## Causa raiz — VERIFICADA na VPS (não hipótese)
PR #180 (commit b2f60719, hoje) tornou o prompt da Sofia pública um **arquivo de
workspace** (`workspace/agents/sofia/AGENT.public.md`) e fez
`ApplyPublicSofiaAgentMD` (`internal/saas/tenant/workspace.go:193`) **falhar duro**
se o arquivo faltar no volume. O provisioner copia o volume do workspace
selecionado: `CopyWorkspaceHome(ws.HostPath, t.VolumePath)` (`provisioner.go:399`),
e só DEPOIS roda `ApplyPublicSofiaAgentMD` no `if t.IsPublic` (`provisioner.go:422`).

Evidência coletada via SSH em 2026-05-31:
- Workspaces reais na VPS: `admin`, `default-business`, `publico`, `tenant`.
- `default-business/home/workspace/agents/sofia/AGENT.public.md` **EXISTE** (10286 B,
  31/05 06:02) — porque o seed embarcado aditivo (`EnsureDefaultWorkspace` fast-path
  → `seedDefaultWorkspaceHome` → `extractEmbeddedBaseline`, em
  `internal/saas/api/workspaces_bootstrap.go`) curou o default-auto quando o
  controlplane pós-#180 subiu hoje.
- `publico/home/workspace/agents/sofia/AGENT.public.md` → **NÃO existe** (`test -f` = NO).
  Dir agents/sofia/ congelado em 24-25/05 (só AGENT.md 6568B + behavior.json).
  Mesmo caso em `admin` e `tenant`.
- O texto do erro casa exatamente com `workspace.go:201` → o binário em prod JÁ é o pós-#180.

**Conclusão:** o seed embarcado aditivo SÓ cura o workspace `default-auto`
(`default-business`). Os workspaces manuais (`publico` = "Publico · v1", `admin`,
`tenant`) nunca recebem arquivos novos do baseline → ficam stale. #180 transformou
o antigo *workspace-skill-seed-gap* (regressão silenciosa) em falha dura de
provisionamento. É o padrão da memória `project_workspace_skill_seed_gap`.

## Por que "tem hora que funciona, tem hora que alucina" (a inconsistência sentida)
1. **Dois seeds → duas Sofias.** Tenant criado de `default-business` pega o novo
   `AGENT.public.md` (fonte única pós-#180). Tenant de `publico` (manual, stale):
   antes de #180 caía silenciosamente na persona cliente (Rafael/time) → "Sofia
   estranha"; depois de #180 nem cria (o erro).
2. **Histórico pré-#180:** 4 fontes divergentes (const Go autoritativa + saudação
   morta no SKILL.md + AGENT.md canônico + frontend hardcoded). Editar a errada =
   no-op → sensação de regressão. #180 colapsou pra 1 (`AGENT.public.md`), MAS só o
   default-business recebeu o arquivo; os manuais seguem velhos.

## Mapa definitivo da fonte de verdade (pós-#180)
- Prompt de runtime do tenant público = bytes de `workspace/AGENT.md` no volume.
  Main agent É a Sofia (sem roteamento de sub-agente no público).
- Esses bytes vêm de `ApplyPublicSofiaAgentMD` copiando `agents/sofia/AGENT.public.md`
  (do workspace seedado) por cima de `AGENT.md`, no provision, só quando IsPublic.
  Backup do cliente em `AGENT.cliente.md`; promote restaura via `RestoreClienteAgentMD`.
- Tools/skills = frontmatter desse AGENT.md + skills presentes no workspace.
- Empty-state do frontend = cosmético, NÃO alimenta o modelo.

## Fixes (decisão do Eduardo pendente; alucinação = "Depois")
- **Operacional (destrava já):** copiar `AGENT.public.md` (+ qualquer arquivo novo do
  baseline) para `/srv/picoclaw-workspaces/{publico,admin,tenant}/home/workspace/agents/sofia/`.
  Fonte: `default-business` já tem, ou o baseline embarcado.
- **Durável (código):** ou (a) `ApplyPublicSofiaAgentMD` cai num fallback embarcado
  em vez de falhar duro; ou (b) o provisioner roda o seed aditivo do baseline
  embarcado contra TODO workspace selecionado no provision (não só default-auto no
  boot). (b) é o mais alinhado com a filosofia "aditivo, skip-if-exists".
  Cuidado de package: embed está em `api`, provisioner em `tenant` (evitar ciclo).

## Confirmação no banco (container `postgres`, user `picoclaw`, db `picoclaw_control`)
- `workspaces` (slug|name|default_auto|manual) — query limpa, autoritativa:
  - `default-business` | "Default Business" | **t** | t   ← ÚNICO default_auto
  - `publico` | "Publico" ("Publico · v1" na UI) | f | t
  - `admin` | "Admin" | f | t
  - `tenant` | "Tenant" | f | t
  (Exatamente UM default_auto, garantido pelo índice parcial único
  `uq_workspaces_default_auto` em `schema.sql:185`. Uma versão anterior deste
  doc citou "três default_auto" — era leitura de uma query que tinha falhado;
  está correto agora. O admin selecionou `publico` MANUALMENTE — por isso o
  default_auto ser `default-business` não ajudou.)
- `tenants` (display_name|is_public|workspace_id|status) — **o padrão bate exato**:
  - `soso` | t | **publico**-6036b7 | **error**
  - `testett-o` | t | **publico**-6036b7 | **error**
  - `testeb` | t | **publico**-6036b7 | **error** (×3)
  - `teste11` | t | **default-business**-94db2e | **active**
  - `teste4` | t | **default-business**-94db2e | deleting
  - `onbording` | t | **publico**-6036b7 | active (criado ANTES do #180)
  → Tenant público de `default-business` = funciona. De `publico` (pós-#180) = erra.
- `controlplane` subiu hoje **06:02:10Z** como **root** (uid=0). O `AGENT.public.md`
  do `default-business` é de **06:02** → o seed aditivo rodou no boot e curou só o
  default_auto (default-business). O seed toca **um** workspace, **uma vez**, no
  startup. `publico` ficou congelado em 24-25/05.

## Verificação de DENTRO do container (desfaz qualquer dúvida)
- `docker exec controlplane id` → uid=0 (root): lê os dirs 700 sem problema. NÃO é
  bug de permissão.
- `docker exec controlplane ls .../publico/home/workspace/agents/sofia/` →
  AGENT.md, behavior.json, memory/, skills/ — **SEM AGENT.public.md**. Confirmado
  do ponto de vista exato do código que falha.
- (Correção honesta: uma versão anterior deste doc citou um 2º erro "workspace home
  not found"; era suposição minha — a coluna `status_detail` nem existe no schema, a
  query tinha falhado. NÃO há segundo erro. A causa é única: AGENT.public.md ausente
  no `publico`.)

## Causa raiz (1 frase)
#180 passou a exigir `agents/sofia/AGENT.public.md` no volume e falha duro se faltar;
o workspace `publico` ("Publico · v1"), usado pra criar o tenant `soso` público,
nunca recebeu esse arquivo novo porque o seed aditivo do baseline embarcado só cura
o workspace default_auto no boot do controlplane — todo workspace manual fica stale.
Prova no banco: todo tenant público criado de `publico` deu `error`; os de
`default-business` (que tem o arquivo) ficaram `active`.

## Fixes possíveis
- **Op imediato (A):** copiar do `default-business` (que já tem) pra `publico`:
  `cp /srv/picoclaw-workspaces/default-business/home/workspace/agents/sofia/AGENT.public.md
     /srv/picoclaw-workspaces/publico/home/workspace/agents/sofia/AGENT.public.md`.
- **Op alternativo (B):** restart do controlplane — como `publico` é default_auto
  AGORA, o seed aditivo no próximo boot deve curá-lo. Mais frágil (depende do flag).
- **Durável (código):** provisioner roda o seed aditivo embarcado contra o workspace
  selecionado no provision (não só default_auto no boot), OU `ApplyPublicSofiaAgentMD`
  cai num fallback embarcado. Cuidado de ciclo de package (embed em `api`, provisioner
  em `tenant`).
