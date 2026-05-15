import {
  IconAlertCircle,
  IconEdit,
  IconLoader2,
  IconSparkles,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type AgentConfigResponse,
  applyAgentTemplate,
  getAgentConfig,
} from "@/api/agent-templates"
import { getSkills } from "@/api/skills"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

import { AGENT_TEMPLATES, getTemplateById } from "../templates/catalog"
import { substituteAgentPlaceholders } from "../templates/substitute-placeholders"
import { TemplateConfigSheet } from "../templates/template-config-sheet"
import { DEFAULT_BEHAVIOR } from "../templates/types"
import type {
  AgentTemplate,
  TemplateApplyPayload,
} from "../templates/types"

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
function prepareDraftForEdit(raw: TemplateApplyPayload): TemplateApplyPayload {
  return substituteAgentPlaceholders(hydrateAgentPayload(raw))
}

export function AgentEditorPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const configQuery = useQuery({
    queryKey: ["agent-config"],
    queryFn: getAgentConfig,
  })
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: getSkills })

  const installedSkills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TemplateApplyPayload | null>(null)

  // The catalog supplies the template metadata (icon, short_description) that
  // the sheet uses for its header. We match by template_id from the persisted
  // payload, and fall back to the first catalog entry only as a safety net
  // (should never happen if apply ran normally).
  const template = useMemo<AgentTemplate | null>(() => {
    const id = configQuery.data?.payload?.template_id
    if (!id) return null
    return getTemplateById(id) ?? AGENT_TEMPLATES[0] ?? null
  }, [configQuery.data?.payload?.template_id])

  const applyMutation = useMutation({
    mutationFn: applyAgentTemplate,
    onSuccess: () => {
      toast.success(t("pages.agent.editor.save_success"))
      // Immediately update the cache so the new name appears without waiting
      // for the background refetch (draft is still non-null here — React batches
      // state updates so setDraft(null) hasn't taken effect yet).
      if (draft) {
        queryClient.setQueryData<AgentConfigResponse>(["agent-config"], (old) => ({
          ...old,
          configured: true,
          payload: draft,
        }))
      }
      setEditing(false)
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ["agent-config"] })
      void queryClient.invalidateQueries({ queryKey: ["config"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("pages.agent.editor.save_error"),
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
    setDraft(prepareDraftForEdit(cloned))
    setEditing(true)
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

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.agent_editor")} />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {configQuery.isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <IconLoader2 className="size-4 animate-spin" />
              {t("pages.agent.editor.loading")}
            </div>
          ) : !configured || !configQuery.data?.payload ? (
            <EmptyState />
          ) : (
            <>
              <section className="border-border/40 bg-card/40 space-y-3 rounded-xl border p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 ring-primary/20 text-primary flex size-12 items-center justify-center rounded-xl ring-1">
                    <IconSparkles className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-foreground truncate text-xl font-bold tracking-tight">
                      {configQuery.data.payload.name}
                    </h2>
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {resolvedPayload?.presentation ??
                        configQuery.data.payload.presentation}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 pt-4 sm:grid-cols-2">
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
        </div>
      </div>

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
          if (draft) applyMutation.mutate(draft)
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

function EmptyState() {
  const { t } = useTranslation()
  return (
    <div className="border-border/40 bg-card/40 flex flex-col items-center gap-4 rounded-xl border p-10 text-center">
      <IconAlertCircle className="text-muted-foreground size-10" />
      <div className="space-y-1">
        <h3 className="text-foreground text-base font-semibold">
          {t("pages.agent.editor.empty_title")}
        </h3>
        <p className="text-muted-foreground max-w-md text-sm">
          {t("pages.agent.editor.empty_description")}
        </p>
      </div>
      <Button asChild>
        <Link to="/agent/templates">
          {t("pages.agent.editor.go_to_templates")}
        </Link>
      </Button>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/30 bg-muted/10 rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </div>
      <div className="text-foreground truncate text-sm font-medium">
        {value || "—"}
      </div>
    </div>
  )
}
