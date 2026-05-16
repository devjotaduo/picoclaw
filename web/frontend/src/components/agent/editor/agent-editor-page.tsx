import {
  IconAlertCircle,
  IconEdit,
  IconLoader2,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type AgentConfigResponse,
  type AgentSummary,
  applyAgentTemplate,
  createAgent,
  deleteAgent,
  getAgentConfig,
  listAgents,
} from "@/api/agent-templates"
import { getSkills } from "@/api/skills"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { AGENT_TEMPLATES, getTemplateById } from "../templates/catalog"
import { substituteAgentPlaceholders } from "../templates/substitute-placeholders"
import { TemplateConfigSheet } from "../templates/template-config-sheet"
import { DEFAULT_BEHAVIOR } from "../templates/types"
import type { AgentTemplate, TemplateApplyPayload } from "../templates/types"
import {
  defaultTemplateSkillConfigs,
  templateToDraft,
} from "../templates/use-templates-page"

function normalizeAgentIDPreview(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64)
  return normalized || "main"
}

// The backend serializes `agent_config.json` with Go's `omitempty`, so empty
// arrays and zero-valued objects come back as `undefined`. The sheet expects
// every array/object key to be present, so we hydrate the holes here.
function hydrateAgentPayload(raw: TemplateApplyPayload): TemplateApplyPayload {
  return {
    ...raw,
    short_description: raw.short_description ?? "",
    personality: raw.personality ?? [],
    values: raw.values ?? [],
    functions: raw.functions ?? [],
    prohibitions: raw.prohibitions ?? [],
    protections: raw.protections ?? [],
    skill_configs: raw.skill_configs ?? [],
    conversation_flow: raw.conversation_flow ?? [],
    required_fields_by_intent: raw.required_fields_by_intent ?? {},
    response_examples: {
      ...{
        greeting: "",
        clarification: "",
        unknown_answer: "",
        routing: "",
        closing: "",
      },
      ...raw.response_examples,
    },
    style_guide: {
      do: raw.style_guide?.do ?? [],
      dont: raw.style_guide?.dont ?? [],
    },
    fallback_policy: {
      max_clarifying_questions:
        raw.fallback_policy?.max_clarifying_questions ?? 0,
      when_unsure: raw.fallback_policy?.when_unsure ?? "",
      when_to_route: raw.fallback_policy?.when_to_route ?? [],
      route_message: raw.fallback_policy?.route_message ?? "",
    },
    handoff_summary_template: raw.handoff_summary_template ?? {
      cliente: "",
      contato: "",
      motivo: "",
      resumo: "",
      dados_coletados: "",
      urgencia: "",
      setor_destino: "",
      proxima_acao: "",
    },
    structured_output_template: raw.structured_output_template ?? {
      intent: "",
      confidence: "",
      collected_fields: {},
      missing_fields: [],
      needs_routing: false,
      target_sector: "",
      priority: "",
      summary: "",
      next_action: "",
    },
    priority_rules: {
      high: raw.priority_rules?.high ?? [],
      medium: raw.priority_rules?.medium ?? [],
      low: raw.priority_rules?.low ?? [],
    },
    knowledge_policy: raw.knowledge_policy ?? [],
    security_rules: raw.security_rules ?? [],
    quality_metrics: raw.quality_metrics ?? [],
    modules: {
      professionals_enabled: raw.modules?.professionals_enabled ?? false,
      products_enabled: raw.modules?.products_enabled ?? false,
    },
    professionals: raw.professionals ?? [],
    products: raw.products ?? [],
    recommended_tools: raw.recommended_tools ?? [],
    tool_namespaces: raw.tool_namespaces ?? [],
    required_integrations: raw.required_integrations ?? [],
    approval_required_for: raw.approval_required_for ?? [],
    company_info: {
      ...raw.company_info,
      general_info: raw.company_info?.general_info ?? "",
      schedule: raw.company_info?.schedule ?? {
        monday: { open: false, from: "", to: "" },
        tuesday: { open: false, from: "", to: "" },
        wednesday: { open: false, from: "", to: "" },
        thursday: { open: false, from: "", to: "" },
        friday: { open: false, from: "", to: "" },
        saturday: { open: false, from: "", to: "" },
        sunday: { open: false, from: "", to: "" },
        notes: "",
      },
    },
    behavior: { ...DEFAULT_BEHAVIOR, ...raw.behavior },
  }
}

// Hydrate + substitute placeholders together so the sheet sees fully resolved
// text, even for configs that were saved before the substitution helper
// existed.
function prepareDraftForEdit(
  raw: TemplateApplyPayload,
  agentId: string,
): TemplateApplyPayload {
  return {
    ...substituteAgentPlaceholders(hydrateAgentPayload(raw)),
    agent_id: agentId,
  }
}

export function AgentEditorPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
  })
  const agents = useMemo(
    () => agentsQuery.data?.agents ?? [],
    [agentsQuery.data?.agents],
  )
  const firstAgentId =
    agents.find((agent) => agent.default)?.id ?? agents[0]?.id ?? "main"
  const [selectedAgentId, setSelectedAgentId] = useState(firstAgentId)

  useEffect(() => {
    if (agents.length === 0) return
    if (!agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(firstAgentId)
    }
  }, [agents, firstAgentId, selectedAgentId])

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null

  const configQuery = useQuery({
    queryKey: ["agent-config", selectedAgentId],
    queryFn: () => getAgentConfig(selectedAgentId),
    enabled: selectedAgentId.trim() !== "",
  })
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: getSkills })

  const installedSkills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TemplateApplyPayload | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newAgentName, setNewAgentName] = useState("")
  const [newAgentID, setNewAgentID] = useState("")
  const [newAgentTemplateID, setNewAgentTemplateID] = useState(
    AGENT_TEMPLATES[0]?.id ?? "",
  )

  // The catalog supplies the template metadata (icon, short_description) that
  // the sheet uses for its header. When creating a fresh agent, the draft owns
  // this id before a persisted config exists.
  const template = useMemo<AgentTemplate | null>(() => {
    const id = draft?.template_id ?? configQuery.data?.payload?.template_id
    if (!id) return null
    return getTemplateById(id) ?? AGENT_TEMPLATES[0] ?? null
  }, [configQuery.data?.payload?.template_id, draft?.template_id])

  const applyMutation = useMutation({
    mutationFn: applyAgentTemplate,
    onSuccess: (_result, appliedDraft) => {
      const agentId = appliedDraft.agent_id ?? selectedAgentId
      toast.success(t("pages.agent.editor.save_success"))
      queryClient.setQueryData<AgentConfigResponse>(
        ["agent-config", agentId],
        (old) => ({
          ...old,
          configured: true,
          payload: appliedDraft,
        }),
      )
      setEditing(false)
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({
        queryKey: ["agent-config", agentId],
      })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("pages.agent.editor.save_error"),
      )
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const name = newAgentName.trim()
      const rawID = newAgentID.trim() || name
      const template =
        getTemplateById(newAgentTemplateID) ?? AGENT_TEMPLATES[0] ?? null
      if (!template) {
        throw new Error("No agent template available.")
      }
      const created = await createAgent({ id: rawID, name })
      return { created, template }
    },
    onSuccess: ({ created, template }) => {
      toast.success(t("pages.agent.editor.create_success", "Agent created."))
      setCreateOpen(false)
      setSelectedAgentId(created.id)
      const nextDraft = templateToDraft(
        template,
        defaultTemplateSkillConfigs(template, installedSkills),
      )
      setDraft({
        ...nextDraft,
        agent_id: created.id,
        name: created.name || nextDraft.name,
      })
      setEditing(true)
      setNewAgentName("")
      setNewAgentID("")
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("pages.agent.editor.create_error", "Could not create agent."),
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: (_result, agentId) => {
      toast.success(
        t("pages.agent.editor.delete_success", "Agent removed from config."),
      )
      if (selectedAgentId === agentId) {
        setSelectedAgentId("main")
      }
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("pages.agent.editor.delete_error", "Could not remove agent."),
      )
    },
  })

  function handleEdit() {
    const payload = configQuery.data?.payload
    if (!payload) return
    // Deep clone + hydrate so the in-sheet edits don't mutate the cache and
    // every array/object the sheet relies on is present (the Go backend uses
    // omitempty for empty collections).
    const cloned = JSON.parse(JSON.stringify(payload)) as TemplateApplyPayload
    setDraft(prepareDraftForEdit(cloned, selectedAgentId))
    setEditing(true)
  }

  function handleCreateOpen() {
    setNewAgentName("")
    setNewAgentID("")
    setNewAgentTemplateID(AGENT_TEMPLATES[0]?.id ?? "")
    setCreateOpen(true)
  }

  function handleConfigureSelectedAgent() {
    if (!selectedAgent) return
    const startingTemplate = AGENT_TEMPLATES[0]
    if (!startingTemplate) return
    const nextDraft = templateToDraft(
      startingTemplate,
      defaultTemplateSkillConfigs(startingTemplate, installedSkills),
    )
    setDraft({
      ...nextDraft,
      agent_id: selectedAgent.id,
      name: selectedAgent.name || nextDraft.name,
    })
    setEditing(true)
  }

  function handleDeleteAgent(agent: AgentSummary) {
    if (agent.id === "main") return
    const confirmed = window.confirm(
      t(
        "pages.agent.editor.delete_confirm",
        "Remove this agent from config? Its workspace files will be preserved.",
      ),
    )
    if (confirmed) {
      deleteMutation.mutate(agent.id)
    }
  }

  function handleSheetOpenChange(open: boolean) {
    if (!open && !applyMutation.isPending) {
      setEditing(false)
      setDraft(null)
    }
  }

  const configured = configQuery.data?.configured ?? false
  // For the summary card, also resolve placeholders so the user doesn't see
  // raw `{agent.name}` text in the presentation preview before clicking Edit.
  const resolvedPayload = useMemo(() => {
    const payload = configQuery.data?.payload
    if (!payload) return null
    return substituteAgentPlaceholders(payload)
  }, [configQuery.data?.payload])

  const isCreateDisabled =
    newAgentName.trim() === "" || createMutation.isPending
  const previewAgentID = normalizeAgentIDPreview(newAgentID || newAgentName)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.agent_editor")} />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <IconUsers className="text-muted-foreground size-4" />
                <h2 className="text-sm font-semibold">
                  {t("pages.agent.editor.agents", "Agents")}
                </h2>
              </div>
              <Button size="sm" onClick={handleCreateOpen}>
                <IconPlus className="size-4" />
                {t("pages.agent.editor.new_agent", "New")}
              </Button>
            </div>

            <div className="border-border/40 bg-card/40 overflow-hidden rounded-xl border">
              {agentsQuery.isLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
                  <IconLoader2 className="size-4 animate-spin" />
                  {t("pages.agent.editor.loading")}
                </div>
              ) : (
                <div className="divide-border/40 divide-y">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      aria-pressed={agent.id === selectedAgentId}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="hover:bg-muted/50 aria-pressed:bg-primary/10 flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition"
                    >
                      <div className="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
                        <IconSparkles className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-foreground truncate text-sm font-medium">
                          {agent.name || agent.id}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">
                          {agent.id}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {agent.default ? (
                            <Badge variant="secondary">
                              {t("pages.agent.editor.default", "Default")}
                            </Badge>
                          ) : null}
                          <Badge
                            variant={agent.configured ? "outline" : "ghost"}
                          >
                            {agent.configured
                              ? t("pages.agent.editor.configured", "Configured")
                              : t("pages.agent.editor.not_configured", "Draft")}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="min-w-0 space-y-6">
            {configQuery.isLoading || agentsQuery.isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <IconLoader2 className="size-4 animate-spin" />
                {t("pages.agent.editor.loading")}
              </div>
            ) : !selectedAgent ? (
              <EmptyState onCreate={handleCreateOpen} />
            ) : !configured || !configQuery.data?.payload ? (
              <EmptyState
                onCreate={handleCreateOpen}
                onConfigure={handleConfigureSelectedAgent}
                agent={selectedAgent}
              />
            ) : (
              <>
                <section className="border-border/40 bg-card/40 space-y-3 rounded-xl border p-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 ring-primary/20 text-primary flex size-12 items-center justify-center rounded-xl ring-1">
                      <IconSparkles className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-foreground truncate text-xl font-bold tracking-tight">
                          {configQuery.data.payload.name}
                        </h2>
                        {selectedAgent.default ? (
                          <Badge variant="secondary">
                            {t("pages.agent.editor.default", "Default")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {resolvedPayload?.presentation ??
                          configQuery.data.payload.presentation}
                      </p>
                    </div>
                    {selectedAgent.id !== "main" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAgent(selectedAgent)}
                        disabled={deleteMutation.isPending}
                        title={t(
                          "pages.agent.editor.delete_agent",
                          "Remove agent",
                        )}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 pt-4 sm:grid-cols-2">
                    <SummaryRow
                      label={t(
                        "pages.agent.editor.summary.agent_id",
                        "Agent ID",
                      )}
                      value={selectedAgent.id}
                    />
                    <SummaryRow
                      label={t(
                        "pages.agent.editor.summary.workspace",
                        "Workspace",
                      )}
                      value={selectedAgent.workspace}
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.template")}
                      value={
                        template?.name ?? configQuery.data.payload.template_id
                      }
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.tone")}
                      value={configQuery.data.payload.tone}
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.language")}
                      value={configQuery.data.payload.language}
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.company")}
                      value={configQuery.data.payload.company_info.name}
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.professionals")}
                      value={
                        configQuery.data.payload.modules?.professionals_enabled
                          ? `${configQuery.data.payload.professionals?.length ?? 0}`
                          : t("pages.agent.editor.summary.disabled")
                      }
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.products")}
                      value={
                        configQuery.data.payload.modules?.products_enabled
                          ? `${configQuery.data.payload.products?.length ?? 0}`
                          : t("pages.agent.editor.summary.disabled")
                      }
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.skills_active")}
                      value={`${configQuery.data.payload.skill_configs?.filter((s) => s.enabled).length ?? 0}`}
                    />
                    <SummaryRow
                      label={t("pages.agent.editor.summary.applied_at")}
                      value={
                        configQuery.data.applied_at
                          ? new Date(
                              configQuery.data.applied_at * 1000,
                            ).toLocaleString()
                          : "—"
                      }
                    />
                  </div>
                </section>

                <div className="flex items-center justify-end">
                  <Button onClick={handleEdit} size="lg">
                    <IconEdit className="size-4" />
                    {t("pages.agent.editor.edit")}
                  </Button>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("pages.agent.editor.create_title", "New agent")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "pages.agent.editor.create_description",
                "Create an agent entry and choose the template used for its first workspace files.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">
                {t("pages.agent.editor.agent_name", "Agent name")}
              </Label>
              <Input
                id="agent-name"
                value={newAgentName}
                onChange={(event) => setNewAgentName(event.target.value)}
                placeholder={t(
                  "pages.agent.editor.agent_name_placeholder",
                  "Sales assistant",
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-id">
                {t("pages.agent.editor.agent_id", "Agent ID")}
              </Label>
              <Input
                id="agent-id"
                value={newAgentID}
                onChange={(event) => setNewAgentID(event.target.value)}
                placeholder={previewAgentID}
              />
              <p className="text-muted-foreground text-xs">
                {t("pages.agent.editor.agent_id_hint", "Runtime ID:")}{" "}
                <span className="font-mono">{previewAgentID}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                {t("pages.agent.editor.starting_template", "Starting template")}
              </Label>
              <Select
                value={newAgentTemplateID}
                onValueChange={setNewAgentTemplateID}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              {t("pages.agent.templates.cancel")}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={isCreateDisabled}
            >
              {createMutation.isPending ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconPlus className="size-4" />
              )}
              {t("pages.agent.editor.create_agent", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reuse the same drawer that the templates page uses for apply. The
          backend POST /api/agent/templates/apply is idempotent and re-renders
          AGENT.md/SOUL.md/behavior.json + saves agent_config.json again. */}
      <TemplateConfigSheet
        open={editing}
        template={template}
        draft={draft}
        isApplying={applyMutation.isPending}
        isSavingTemplate={false}
        isResettingTemplate={false}
        hasSavedOverride={false}
        installedSkills={installedSkills}
        onDraftChange={setDraft}
        onApply={() => {
          if (draft) {
            applyMutation.mutate({
              ...draft,
              agent_id: draft.agent_id ?? selectedAgentId,
            })
          }
        }}
        onSaveTemplate={() => {
          /* not exposed in agent editor — template defaults are managed
             from /agent/template-editor instead. */
        }}
        onResetTemplate={() => {
          /* same as above */
        }}
        onOpenChange={handleSheetOpenChange}
      />
    </div>
  )
}

function EmptyState({
  agent,
  onCreate,
  onConfigure,
}: {
  agent?: AgentSummary
  onCreate: () => void
  onConfigure?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="border-border/40 bg-card/40 flex flex-col items-center gap-4 rounded-xl border p-10 text-center">
      <IconAlertCircle className="text-muted-foreground size-10" />
      <div className="space-y-1">
        <h3 className="text-foreground text-base font-semibold">
          {agent
            ? t(
                "pages.agent.editor.empty_agent_title",
                "This agent has no template yet",
              )
            : t("pages.agent.editor.empty_title")}
        </h3>
        <p className="text-muted-foreground max-w-md text-sm">
          {agent
            ? t(
                "pages.agent.editor.empty_agent_description",
                "Create or apply a template so the workspace gets AGENT.md, SOUL.md, behavior.json and editor state.",
              )
            : t("pages.agent.editor.empty_description")}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {agent && onConfigure ? (
          <Button onClick={onConfigure}>
            <IconSparkles className="size-4" />
            {t("pages.agent.editor.configure_agent", "Configure")}
          </Button>
        ) : null}
        <Button
          onClick={onCreate}
          variant={agent && onConfigure ? "outline" : "default"}
        >
          <IconPlus className="size-4" />
          {t("pages.agent.editor.new_agent", "New")}
        </Button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/30 bg-muted/10 min-w-0 rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </div>
      <div className="text-foreground truncate text-sm font-medium">
        {value || "—"}
      </div>
    </div>
  )
}
