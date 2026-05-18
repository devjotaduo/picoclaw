import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type AgentConfigResponse,
  type TemplateOverride,
  applyAgentTemplate,
  getTemplateOverrides,
  resetTemplateOverride,
  saveTemplateOverride,
} from "@/api/agent-templates"
import { getAppConfig } from "@/api/channels"
import { type SkillSupportItem, getSkills } from "@/api/skills"

import { AGENT_TEMPLATES } from "./catalog"
import { compareTemplates, sortCategories } from "./category-utils"
import { substituteAgentPlaceholders } from "./substitute-placeholders"
import type { TemplateGroupSection } from "./templates-list"
import { DEFAULT_BEHAVIOR } from "./types"
import type {
  AgentTemplate,
  TemplateApplyPayload,
  TemplateCategory,
  TemplateKnowledgeBase,
  TemplateLayoutMode,
  TemplateSkillConfig,
} from "./types"

function cloneKnowledgeBase(
  knowledgeBase?: TemplateKnowledgeBase,
): TemplateKnowledgeBase {
  return {
    overview: knowledgeBase?.overview ?? "",
    faqs: (knowledgeBase?.faqs ?? []).map((faq) => ({
      question: faq.question ?? "",
      answer: faq.answer ?? "",
    })),
  }
}

export function templateToDraft(
  template: AgentTemplate,
  defaultSkillConfigs: TemplateSkillConfig[] = [],
): TemplateApplyPayload {
  const draft: TemplateApplyPayload = {
    template_id: template.id,
    name: template.name,
    short_description: template.short_description,
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
    skill_configs: defaultSkillConfigs.map((c) => ({ ...c })),
    model: template.recommended_model,
    conversation_flow: [...template.conversation_flow],
    required_fields_by_intent: Object.fromEntries(
      Object.entries(template.required_fields_by_intent).map(([k, v]) => [
        k,
        [...v],
      ]),
    ),
    response_examples: { ...template.response_examples },
    knowledge_base: cloneKnowledgeBase(template.knowledge_base),
    style_guide: {
      emoji_policy: template.style_guide.emoji_policy ?? "minimal",
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
  // Keep catalog placeholders in the editable draft. They are resolved only
  // when applying, so changing the configured agent/company names stays in
  // sync with presentation, examples, fallback text, and behavior replies.
  return draft
}

export function defaultTemplateSkillConfigs(
  template: AgentTemplate,
  installedSkills: SkillSupportItem[],
): TemplateSkillConfig[] {
  const installedByName = new Map(
    installedSkills.map((skill) => [skill.name.toLowerCase(), skill.name]),
  )
  return template.recommended_skills
    .map((name) => installedByName.get(name.toLowerCase()))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name, enabled: true, visible: true }))
}

function skillConfigsForTemplate(
  template: AgentTemplate,
  installedSkills: SkillSupportItem[],
  override?: TemplateOverride,
): TemplateSkillConfig[] {
  const fromOverride = override?.draft?.skill_configs ?? override?.skill_configs
  if (fromOverride) {
    return fromOverride.map((config) => ({ ...config }))
  }
  return defaultTemplateSkillConfigs(template, installedSkills)
}

function templateFromDraft(
  base: AgentTemplate,
  override?: TemplateOverride,
): AgentTemplate {
  const draft = override?.draft
  if (!draft) return base
  return {
    ...base,
    name: draft.name || base.name,
    short_description: draft.short_description || base.short_description,
    presentation: draft.presentation,
    personality: [...draft.personality],
    values: [...draft.values],
    functions: [...draft.functions],
    prohibitions: [...draft.prohibitions],
    protections: [...draft.protections],
    company_info: {
      ...draft.company_info,
      schedule: {
        monday: { ...draft.company_info.schedule.monday },
        tuesday: { ...draft.company_info.schedule.tuesday },
        wednesday: { ...draft.company_info.schedule.wednesday },
        thursday: { ...draft.company_info.schedule.thursday },
        friday: { ...draft.company_info.schedule.friday },
        saturday: { ...draft.company_info.schedule.saturday },
        sunday: { ...draft.company_info.schedule.sunday },
        notes: draft.company_info.schedule.notes,
      },
    },
    language: draft.language,
    tone: draft.tone,
    recommended_model: draft.model,
    conversation_flow: [...draft.conversation_flow],
    required_fields_by_intent: Object.fromEntries(
      Object.entries(draft.required_fields_by_intent).map(([k, v]) => [
        k,
        [...v],
      ]),
    ),
    response_examples: { ...draft.response_examples },
    knowledge_base: cloneKnowledgeBase(draft.knowledge_base),
    style_guide: {
      emoji_policy: draft.style_guide.emoji_policy ?? "minimal",
      do: [...draft.style_guide.do],
      dont: [...draft.style_guide.dont],
    },
    fallback_policy: {
      ...draft.fallback_policy,
      when_to_route: [...draft.fallback_policy.when_to_route],
    },
    handoff_summary_template: { ...draft.handoff_summary_template },
    structured_output_template: {
      ...draft.structured_output_template,
      collected_fields: {
        ...draft.structured_output_template.collected_fields,
      },
      missing_fields: [...draft.structured_output_template.missing_fields],
    },
    priority_rules: {
      high: [...draft.priority_rules.high],
      medium: [...draft.priority_rules.medium],
      low: [...draft.priority_rules.low],
    },
    knowledge_policy: [...draft.knowledge_policy],
    security_rules: [...draft.security_rules],
    quality_metrics: [...draft.quality_metrics],
    modules: { ...draft.modules },
    professionals: draft.professionals.map((p) => ({
      ...p,
      services: p.services.map((s) => ({ ...s })),
    })),
    products: draft.products.map((p) => ({ ...p })),
    recommended_tools: [...draft.recommended_tools],
    tool_namespaces: [...draft.tool_namespaces],
    required_integrations: [...draft.required_integrations],
    permission_level: draft.permission_level,
    approval_required_for: [...draft.approval_required_for],
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

  const overridesQuery = useQuery({
    queryKey: ["template-overrides"],
    queryFn: getTemplateOverrides,
  })

  const overrides = useMemo(
    () => overridesQuery.data?.overrides ?? {},
    [overridesQuery.data?.overrides],
  )

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
    onSuccess: (_response, appliedPayload) => {
      toast.success(t("pages.agent.templates.apply_success"))
      // Immediately populate the agent-config cache so any component that reads
      // it (e.g. the editor page) sees the new data without waiting for a refetch.
      if (appliedPayload) {
        queryClient.setQueryData<AgentConfigResponse>(
          ["agent-config"],
          (old) => ({
            ...old,
            configured: true,
            payload: appliedPayload,
          }),
        )
        queryClient.setQueryData<AgentConfigResponse>(
          ["agent-config", appliedPayload.agent_id ?? "main"],
          (old) => ({
            ...old,
            configured: true,
            payload: appliedPayload,
          }),
        )
      }
      setSelectedTemplate(null)
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ["config"] })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      void queryClient.invalidateQueries({ queryKey: ["agent-config"] })
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

  const saveMutation = useMutation({
    mutationFn: (payload: TemplateApplyPayload) =>
      saveTemplateOverride(payload.template_id, {
        skill_configs: payload.skill_configs,
        draft: payload,
      }),
    onSuccess: () => {
      toast.success(
        t("pages.agent.templates.save_template_success", "Template saved."),
      )
      void queryClient.invalidateQueries({ queryKey: ["template-overrides"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "pages.agent.templates.save_template_error",
              "Could not save template.",
            ),
      )
    },
  })

  const resetMutation = useMutation({
    mutationFn: (templateId: string) => resetTemplateOverride(templateId),
    onSuccess: (_result, templateId) => {
      toast.success(
        t(
          "pages.agent.templates.reset_template_success",
          "Template defaults restored.",
        ),
      )
      const baseTemplate =
        AGENT_TEMPLATES.find((tpl) => tpl.id === templateId) ?? null
      setSelectedTemplate(baseTemplate)
      setDraft(
        baseTemplate
          ? templateToDraft(
              baseTemplate,
              defaultTemplateSkillConfigs(baseTemplate, installedSkills),
            )
          : null,
      )
      void queryClient.invalidateQueries({ queryKey: ["template-overrides"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "pages.agent.templates.reset_template_error",
              "Could not restore template defaults.",
            ),
      )
    },
  })

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()

  const templates = useMemo(
    () =>
      AGENT_TEMPLATES.map((template) =>
        templateFromDraft(template, overrides[template.id]),
      ),
    [overrides],
  )

  const availableCategories = useMemo<TemplateCategory[]>(
    () => sortCategories([...new Set(templates.map((tpl) => tpl.category))]),
    [templates],
  )

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchesCategory =
        categoryFilter === "all" ? true : tpl.category === categoryFilter
      if (!matchesCategory) return false
      if (normalizedSearchQuery === "") return true
      const haystack =
        `${tpl.name} ${tpl.short_description} ${tpl.functions.join(" ")}`.toLowerCase()
      return haystack.includes(normalizedSearchQuery)
    })
  }, [templates, normalizedSearchQuery, categoryFilter])

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

  useEffect(() => {
    if (!selectedTemplate || !draft || installedSkills.length === 0) return
    const override = overrides[selectedTemplate.id]
    const overrideSkillConfigs =
      override?.draft?.skill_configs ?? override?.skill_configs
    if (overrideSkillConfigs !== undefined || draft.skill_configs.length > 0) {
      return
    }
    const defaults = defaultTemplateSkillConfigs(
      selectedTemplate,
      installedSkills,
    )
    if (defaults.length === 0) return
    setDraft((current) =>
      current?.template_id === selectedTemplate.id &&
      current.skill_configs.length === 0
        ? { ...current, skill_configs: defaults }
        : current,
    )
  }, [draft, installedSkills, overrides, selectedTemplate])

  function handleUseTemplate(template: AgentTemplate) {
    setSelectedTemplate(template)
    setDraft(
      templateToDraft(
        template,
        skillConfigsForTemplate(
          template,
          installedSkills,
          overrides[template.id],
        ),
      ),
    )
  }

  function handleDrawerOpenChange(open: boolean) {
    if (!open && !applyMutation.isPending) {
      setSelectedTemplate(null)
      setDraft(null)
    }
  }

  function handleApply() {
    if (!draft) return
    applyMutation.mutate(substituteAgentPlaceholders(draft))
  }

  function handleSaveTemplate() {
    if (!draft) return
    saveMutation.mutate(draft)
  }

  function handleResetTemplate() {
    if (!draft) return
    resetMutation.mutate(draft.template_id)
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
    isSavingTemplate: saveMutation.isPending,
    isResettingTemplate: resetMutation.isPending,
    hasSavedOverride: draft ? Boolean(overrides[draft.template_id]) : false,
    setSearchQuery,
    setCategoryFilter,
    setLayoutMode,
    setDraft,
    handleUseTemplate,
    handleDrawerOpenChange,
    handleApply,
    handleSaveTemplate,
    handleResetTemplate,
  }
}
