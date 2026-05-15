import { IconCheck, IconLoader2, IconRefresh } from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type TemplateOverridesResponse,
  getTemplateOverrides,
  resetTemplateOverride,
  saveTemplateOverride,
} from "@/api/agent-templates"
import { getSkills } from "@/api/skills"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { AGENT_TEMPLATES } from "../templates/catalog"
import { TemplateIcon } from "../templates/template-icon"
import type { AgentTemplate, TemplateSkillConfig } from "../templates/types"

export function TemplateEditorPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(
    AGENT_TEMPLATES[0]?.id ?? null,
  )
  const [search, setSearch] = useState("")

  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: getSkills })
  const overridesQuery = useQuery({
    queryKey: ["template-overrides"],
    queryFn: getTemplateOverrides,
  })

  const installedSkills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  )

  const overrides = useMemo(
    () => overridesQuery.data?.overrides ?? {},
    [overridesQuery.data?.overrides],
  )
  const selectedTemplate = useMemo<AgentTemplate | null>(
    () => AGENT_TEMPLATES.find((tpl) => tpl.id === selectedId) ?? null,
    [selectedId],
  )

  const [draftConfigs, setDraftConfigs] = useState<TemplateSkillConfig[]>([])
  const [dirty, setDirty] = useState(false)

  // Resync draft whenever the selected template or fetched overrides change,
  // so opening the page (or switching template) starts from the persisted state.
  useEffect(() => {
    if (!selectedId) {
      setDraftConfigs([])
      setDirty(false)
      return
    }
    const fromServer = overrides[selectedId]?.skill_configs ?? []
    setDraftConfigs(fromServer.map((c) => ({ ...c })))
    setDirty(false)
  }, [selectedId, overrides])

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q === "") return AGENT_TEMPLATES
    return AGENT_TEMPLATES.filter((tpl) =>
      `${tpl.name} ${tpl.short_description}`.toLowerCase().includes(q),
    )
  }, [search])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("no template selected")
      return saveTemplateOverride(selectedId, {
        ...overrides[selectedId],
        skill_configs: draftConfigs,
      })
    },
    onSuccess: () => {
      toast.success(t("pages.agent.template_editor.save_success"))
      setDirty(false)
      void queryClient.invalidateQueries({ queryKey: ["template-overrides"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("pages.agent.template_editor.save_error"),
      )
    },
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("no template selected")
      return resetTemplateOverride(selectedId)
    },
    onSuccess: () => {
      toast.success(t("pages.agent.template_editor.reset_success"))
      void queryClient.invalidateQueries({ queryKey: ["template-overrides"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("pages.agent.template_editor.reset_error"),
      )
    },
  })

  function getConfig(name: string): TemplateSkillConfig | undefined {
    return draftConfigs.find((c) => c.name === name)
  }

  function setConfig(
    name: string,
    patch: Partial<Omit<TemplateSkillConfig, "name">>,
  ) {
    setDraftConfigs((prev) => {
      const existing = prev.find((c) => c.name === name)
      const merged: TemplateSkillConfig = {
        name,
        enabled: existing?.enabled ?? false,
        visible: existing?.visible ?? true,
        ...patch,
      }
      const next = existing
        ? prev.map((c) => (c.name === name ? merged : c))
        : [...prev, merged]
      return next
    })
    setDirty(true)
  }

  const hasOverride = selectedId ? Boolean(overrides[selectedId]) : false

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.template_editor")} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="border-border/40 bg-muted/10 flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r p-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pages.agent.template_editor.search_placeholder")}
          />
          <ul className="mt-2 space-y-1">
            {filteredTemplates.map((tpl) => {
              const isActive = tpl.id === selectedId
              const hasIt = Boolean(overrides[tpl.id])
              return (
                <li key={tpl.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(tpl.id)}
                    className={cn(
                      "border-border/40 bg-card/40 hover:bg-muted/30 flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                      isActive && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="bg-primary/10 ring-primary/20 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg ring-1">
                      <TemplateIcon name={tpl.icon} className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {tpl.name}
                      </div>
                      <div className="text-muted-foreground line-clamp-2 text-xs">
                        {tpl.short_description}
                      </div>
                    </div>
                    {hasIt ? (
                      <span className="bg-primary/15 text-primary mt-1 rounded-full px-1.5 text-[10px] font-medium">
                        {t("pages.agent.template_editor.edited_badge")}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
            {selectedTemplate ? (
              <>
                <header className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {selectedTemplate.name}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {selectedTemplate.short_description}
                  </p>
                </header>

                <section className="border-border/40 bg-card/40 space-y-4 rounded-xl border p-5">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold tracking-tight">
                      {t("pages.agent.template_editor.skills_title")}
                    </h3>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {t("pages.agent.template_editor.skills_description")}
                    </p>
                  </div>

                  {skillsQuery.isLoading || overridesQuery.isLoading ? (
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <IconLoader2 className="size-4 animate-spin" />
                      {t("pages.agent.template_editor.loading")}
                    </div>
                  ) : installedSkills.length === 0 ? (
                    <div className="border-border/40 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                      {t("pages.agent.templates.skills_empty")}
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {installedSkills.map((skill) => {
                        const cfg = getConfig(skill.name)
                        const enabled = cfg?.enabled ?? false
                        const visible = cfg?.visible ?? true
                        return (
                          <li
                            key={skill.name}
                            className="border-border/50 bg-muted/10 space-y-2 rounded-lg border px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <Label
                                  htmlFor={`ed-en-${skill.name}`}
                                  className="cursor-pointer text-sm font-medium"
                                >
                                  {skill.name}
                                </Label>
                                {skill.description ? (
                                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                                    {skill.description}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                  {t(
                                    "pages.agent.templates.skills_toggles.enabled",
                                  )}
                                </span>
                                <Switch
                                  id={`ed-en-${skill.name}`}
                                  checked={enabled}
                                  onCheckedChange={(checked) =>
                                    setConfig(skill.name, { enabled: checked })
                                  }
                                />
                              </div>
                            </div>
                            {enabled ? (
                              <div className="border-border/40 flex items-center justify-between gap-3 border-t pt-2">
                                <Label
                                  htmlFor={`ed-vi-${skill.name}`}
                                  className="text-muted-foreground cursor-pointer text-xs"
                                >
                                  {t(
                                    "pages.agent.templates.skills_toggles.visible_label",
                                  )}
                                  <span className="text-muted-foreground/70 ml-1 text-[11px]">
                                    {t(
                                      "pages.agent.templates.skills_toggles.visible_hint",
                                    )}
                                  </span>
                                </Label>
                                <Switch
                                  id={`ed-vi-${skill.name}`}
                                  checked={visible}
                                  onCheckedChange={(checked) =>
                                    setConfig(skill.name, { visible: checked })
                                  }
                                />
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                <div className="flex items-center justify-end gap-3">
                  {hasOverride ? (
                    <Button
                      variant="outline"
                      onClick={() => resetMutation.mutate()}
                      disabled={resetMutation.isPending}
                    >
                      {resetMutation.isPending ? (
                        <IconLoader2 className="size-4 animate-spin" />
                      ) : (
                        <IconRefresh className="size-4" />
                      )}
                      {t("pages.agent.template_editor.reset")}
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!dirty || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : (
                      <IconCheck className="size-4" />
                    )}
                    {t("pages.agent.template_editor.save")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                {t("pages.agent.template_editor.empty_selection")}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// Helper kept here so the page is self-contained for future re-use elsewhere.
export type { TemplateOverridesResponse }
