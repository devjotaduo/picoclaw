import {
  IconAlertTriangle,
  IconCheck,
  IconLoader2,
  IconLock,
  IconRefresh,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type SkillSupportItem,
  getSkillRaw,
  getSkills,
  updateSkill,
} from "@/api/skills"
import { CodeEditor } from "@/components/code-editor"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function SkillEditorPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState<string>("")
  const [dirty, setDirty] = useState(false)

  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: getSkills })
  const skills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  )

  // Auto-select the first skill once the list loads, so the editor isn't
  // greeted by an empty pane.
  useEffect(() => {
    if (selectedName === null && skills.length > 0) {
      setSelectedName(skills[0].name)
    }
  }, [skills, selectedName])

  const rawQuery = useQuery({
    queryKey: ["skill-raw", selectedName],
    queryFn: () => getSkillRaw(selectedName as string),
    enabled: selectedName !== null,
  })

  useEffect(() => {
    if (rawQuery.data?.content !== undefined) {
      setDraft(rawQuery.data.content)
      setDirty(false)
    }
  }, [rawQuery.data?.content])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q === "") return skills
    return skills.filter((s) =>
      `${s.name} ${s.description ?? ""}`.toLowerCase().includes(q),
    )
  }, [skills, search])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedName) throw new Error("no skill selected")
      return updateSkill(selectedName, draft)
    },
    onSuccess: () => {
      toast.success(t("pages.agent.skill_editor.save_success"))
      setDirty(false)
      void queryClient.invalidateQueries({
        queryKey: ["skill-raw", selectedName],
      })
      void queryClient.invalidateQueries({ queryKey: ["skills"] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("pages.agent.skill_editor.save_error"),
      )
    },
  })

  const editable = rawQuery.data?.editable ?? false
  const source = rawQuery.data?.source ?? ""

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.skill_editor")} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="border-border/40 bg-muted/10 flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r p-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pages.agent.skill_editor.search_placeholder")}
          />
          {skillsQuery.isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
              <IconLoader2 className="size-4 animate-spin" />
              {t("pages.agent.skill_editor.loading")}
            </div>
          ) : (
            <ul className="mt-2 space-y-1">
              {filtered.map((skill) => (
                <li key={skill.name}>
                  <SkillListItem
                    skill={skill}
                    active={skill.name === selectedName}
                    onClick={() => {
                      if (
                        dirty &&
                        !window.confirm(
                          t("pages.agent.skill_editor.discard_changes"),
                        )
                      ) {
                        return
                      }
                      setSelectedName(skill.name)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden">
          {selectedName === null ? (
            <div className="text-muted-foreground p-6 text-sm">
              {t("pages.agent.skill_editor.empty_selection")}
            </div>
          ) : rawQuery.isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
              <IconLoader2 className="size-4 animate-spin" />
              {t("pages.agent.skill_editor.loading")}
            </div>
          ) : rawQuery.isError ? (
            <div className="p-6 text-sm text-red-500">
              {rawQuery.error instanceof Error
                ? rawQuery.error.message
                : t("pages.agent.skill_editor.load_error")}
            </div>
          ) : (
            <>
              <header className="border-border/40 flex items-start justify-between gap-3 border-b px-6 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {selectedName}
                  </h2>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <code className="bg-muted/40 rounded px-1.5 py-0.5">
                      {rawQuery.data?.path}
                    </code>
                    <span className="bg-muted/30 rounded-full px-2 py-0.5 tracking-wide uppercase">
                      {source}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        dirty &&
                        !window.confirm(
                          t("pages.agent.skill_editor.discard_changes"),
                        )
                      ) {
                        return
                      }
                      void rawQuery.refetch()
                    }}
                    disabled={rawQuery.isFetching}
                  >
                    <IconRefresh className="size-4" />
                    {t("pages.agent.skill_editor.reload")}
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!editable || !dirty || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : (
                      <IconCheck className="size-4" />
                    )}
                    {t("pages.agent.skill_editor.save")}
                  </Button>
                </div>
              </header>

              {!editable ? (
                <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <IconLock className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {t("pages.agent.skill_editor.read_only_title")}
                    </p>
                    <p className="text-amber-700/80 dark:text-amber-300/80">
                      {t("pages.agent.skill_editor.read_only_hint")}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-1 flex-col gap-2 overflow-hidden p-6 pt-4">
                <CodeEditor
                  value={draft}
                  onChange={(value) => {
                    setDraft(value)
                    setDirty(true)
                  }}
                  language="markdown"
                  path={rawQuery.data?.path}
                  readOnly={!editable}
                  ariaLabel={t("navigation.skill_editor")}
                  className="min-h-[400px] flex-1"
                />
                <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                  <span>
                    {t("pages.agent.skill_editor.char_count", {
                      count: draft.length,
                    })}
                  </span>
                  {dirty ? (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <IconAlertTriangle className="size-3" />
                      {t("pages.agent.skill_editor.unsaved")}
                    </span>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function SkillListItem({
  skill,
  active,
  onClick,
}: {
  skill: SkillSupportItem
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-border/40 bg-card/40 hover:bg-muted/30 flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
        active && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{skill.name}</span>
        <span className="bg-muted/30 text-muted-foreground rounded-full px-1.5 text-[10px] tracking-wide uppercase">
          {skill.source}
        </span>
      </div>
      {skill.description ? (
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {skill.description}
        </p>
      ) : null}
    </button>
  )
}
