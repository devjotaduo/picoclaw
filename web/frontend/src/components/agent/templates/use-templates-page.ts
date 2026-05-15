import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useDeferredValue, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { applyAgentTemplate } from "@/api/agent-templates"
import { getAppConfig } from "@/api/channels"
import { getSkills } from "@/api/skills"

import { AGENT_TEMPLATES } from "./catalog"
import { compareTemplates, sortCategories } from "./category-utils"
import type { TemplateGroupSection } from "./templates-list"
import { DEFAULT_BEHAVIOR } from "./types"
import type {
  AgentTemplate,
  TemplateApplyPayload,
  TemplateCategory,
  TemplateLayoutMode,
} from "./types"

function templateToDraft(template: AgentTemplate): TemplateApplyPayload {
  return {
    template_id: template.id,
    name: template.name,
    presentation: template.presentation,
    personality: [...template.personality],
    values: [...template.values],
    functions: [...template.functions],
    prohibitions: [...template.prohibitions],
    protections: [...template.protections],
    company_info: {
      ...template.company_info,
      schedule: {
        monday: { ...template.company_info.schedule.monday },
        tuesday: { ...template.company_info.schedule.tuesday },
        wednesday: { ...template.company_info.schedule.wednesday },
        thursday: { ...template.company_info.schedule.thursday },
        friday: { ...template.company_info.schedule.friday },
        saturday: { ...template.company_info.schedule.saturday },
        sunday: { ...template.company_info.schedule.sunday },
        notes: template.company_info.schedule.notes,
      },
    },
    language: template.language,
    tone: template.tone,
    skills: [],
    model: template.recommended_model,
    conversation_flow: [...template.conversation_flow],
    required_fields_by_intent: Object.fromEntries(
      Object.entries(template.required_fields_by_intent).map(([k, v]) => [
        k,
        [...v],
      ]),
    ),
    response_examples: { ...template.response_examples },
    style_guide: {
      do: [...template.style_guide.do],
      dont: [...template.style_guide.dont],
    },
    fallback_policy: {
      ...template.fallback_policy,
      when_to_route: [...template.fallback_policy.when_to_route],
    },
    handoff_summary_template: { ...template.handoff_summary_template },
    structured_output_template: {
      ...template.structured_output_template,
      collected_fields: {
        ...template.structured_output_template.collected_fields,
      },
      missing_fields: [...template.structured_output_template.missing_fields],
    },
    priority_rules: {
      high: [...template.priority_rules.high],
      medium: [...template.priority_rules.medium],
      low: [...template.priority_rules.low],
    },
    knowledge_policy: [...template.knowledge_policy],
    security_rules: [...template.security_rules],
    quality_metrics: [...template.quality_metrics],
    modules: { ...template.modules },
    professionals: template.professionals.map((p) => ({
      ...p,
      services: p.services.map((s) => ({ ...s })),
    })),
    products: template.products.map((p) => ({ ...p })),
    recommended_tools: [...template.recommended_tools],
    tool_namespaces: [...template.tool_namespaces],
    required_integrations: [...template.required_integrations],
    permission_level: template.permission_level,
    approval_required_for: [...template.approval_required_for],
    behavior: {
      ...DEFAULT_BEHAVIOR,
      handoff_keywords: [...DEFAULT_BEHAVIOR.handoff_keywords],
    },
  }
}

export function useTemplatesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState("")
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [layoutMode, setLayoutMode] = useState<TemplateLayoutMode>("grouped")
  const [selectedTemplate, setSelectedTemplate] =
    useState<AgentTemplate | null>(null)
  const [draft, setDraft] = useState<TemplateApplyPayload | null>(null)

  const skillsQuery = useQuery({
    queryKey: ["skills"],
    queryFn: getSkills,
  })

  const installedSkills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  )

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: getAppConfig,
  })

  // Read agents.defaults.active_template_id from the config so the dashboard
  // can show which template is currently applied across reloads. AppConfig is
  // an open record on the FE side (the backend exposes the full struct), so
  // we drill through with narrow casts and fall back to null on shape drift.
  const activeTemplateId = useMemo<string | null>(() => {
    const cfg = configQuery.data
    if (!cfg || typeof cfg !== "object") return null
    const agents = (cfg as Record<string, unknown>).agents
    if (!agents || typeof agents !== "object") return null
    const defaults = (agents as Record<string, unknown>).defaults
    if (!defaults || typeof defaults !== "object") return null
    const id = (defaults as Record<string, unknown>).active_template_id
    return typeof id === "string" && id.trim() !== "" ? id : null
  }, [configQuery.data])

  const applyMutation = useMutation({
    mutationFn: applyAgentTemplate,
    onSuccess: () => {
      toast.success(t("pages.agent.templates.apply_success"))
      setSelectedTemplate(null)
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ["config"] })
      void configQuery.refetch()
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("pages.agent.templates.apply_error"),
      )
    },
  })

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()

  const availableCategories = useMemo<TemplateCategory[]>(
    () =>
      sortCategories([...new Set(AGENT_TEMPLATES.map((tpl) => tpl.category))]),
    [],
  )

  const filteredTemplates = useMemo(() => {
    return AGENT_TEMPLATES.filter((tpl) => {
      const matchesCategory =
        categoryFilter === "all" ? true : tpl.category === categoryFilter
      if (!matchesCategory) return false
      if (normalizedSearchQuery === "") return true
      const haystack =
        `${tpl.name} ${tpl.short_description} ${tpl.functions.join(" ")}`.toLowerCase()
      return haystack.includes(normalizedSearchQuery)
    })
  }, [normalizedSearchQuery, categoryFilter])

  const sortedTemplates = useMemo(
    () => [...filteredTemplates].sort(compareTemplates),
    [filteredTemplates],
  )

  const groupedTemplates = useMemo<TemplateGroupSection[]>(
    () =>
      availableCategories
        .map((category) => ({
          category,
          templates: sortedTemplates.filter((tpl) => tpl.category === category),
        }))
        .filter((section) => section.templates.length > 0),
    [availableCategories, sortedTemplates],
  )

  const hasActiveFilters =
    normalizedSearchQuery !== "" || categoryFilter !== "all"

  function handleUseTemplate(template: AgentTemplate) {
    setSelectedTemplate(template)
    setDraft(templateToDraft(template))
  }

  function handleDrawerOpenChange(open: boolean) {
    if (!open && !applyMutation.isPending) {
      setSelectedTemplate(null)
      setDraft(null)
    }
  }

  function handleApply() {
    if (!draft) return
    applyMutation.mutate(draft)
  }

  return {
    searchQuery,
    categoryFilter,
    layoutMode,
    selectedTemplate,
    draft,
    installedSkills,
    activeTemplateId,
    availableCategories,
    sortedTemplates,
    groupedTemplates,
    hasActiveFilters,
    isApplying: applyMutation.isPending,
    setSearchQuery,
    setCategoryFilter,
    setLayoutMode,
    setDraft,
    handleUseTemplate,
    handleDrawerOpenChange,
    handleApply,
  }
}
