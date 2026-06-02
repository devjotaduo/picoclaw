import {
  IconAlertCircle,
  IconCheck,
  IconCircleCheck,
  IconCircleDashed,
  IconDeviceFloppy,
  IconLoader2,
  IconRefresh,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  type CompanyProfileField,
  type CompanyProfileFieldStatus,
  type CompanyProfileGroup,
  getCompanyProfile,
  saveCompanyProfile,
} from "@/api/company-profile"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const statusMeta: Record<
  CompanyProfileFieldStatus,
  {
    label: string
    icon: typeof IconCircleDashed
    variant: "outline" | "secondary" | "destructive" | "default"
  }
> = {
  missing: {
    label: "faltando",
    icon: IconCircleDashed,
    variant: "destructive",
  },
  pending: {
    label: "pendente",
    icon: IconAlertCircle,
    variant: "secondary",
  },
  filled: {
    label: "preenchido",
    icon: IconCheck,
    variant: "outline",
  },
  validated: {
    label: "validado",
    icon: IconShieldCheck,
    variant: "default",
  },
}

function fieldLooksReady(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized !== "" &&
    !normalized.includes("[atualizar]") &&
    !normalized.includes("pendente de validação") &&
    !normalized.includes("pendente de validacao")
  )
}

function draftStatus(
  field: CompanyProfileField,
  value: string,
): CompanyProfileFieldStatus {
  const normalized = value.trim().toLowerCase()
  if (normalized.includes("pendente")) return "pending"
  if (field.id === "information_status" && normalized.includes("validado")) {
    return "validated"
  }
  return fieldLooksReady(value) ? "filled" : "missing"
}

function countDrafts(
  groups: CompanyProfileGroup[],
  drafts: Record<string, string>,
) {
  let total = 0
  let completed = 0
  for (const group of groups) {
    for (const field of group.fields) {
      total += 1
      const status = draftStatus(field, drafts[field.id] ?? field.value)
      if (status !== "missing" && status !== "pending") completed += 1
    }
  }
  return { total, completed, missing: total - completed }
}

function flattenFields(groups: CompanyProfileGroup[]): CompanyProfileField[] {
  return groups.flatMap((group) => group.fields)
}

function getRequestedField(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("field")
}

function StatusBadge({ status }: { status: CompanyProfileFieldStatus }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant}>
      <Icon data-icon="inline-start" />
      {meta.label}
    </Badge>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 px-6 pb-6">
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

export function MemoryPage() {
  const qc = useQueryClient()
  const requestedField = useMemo(() => getRequestedField(), [])
  const profileQuery = useQuery({
    queryKey: ["company-profile"],
    queryFn: getCompanyProfile,
    refetchInterval: 30_000,
  })

  const groups = profileQuery.data?.groups ?? []
  const fields = useMemo(() => flattenFields(groups), [groups])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [activeGroup, setActiveGroup] = useState("empresa")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profileQuery.data) return
    const nextDrafts: Record<string, string> = {}
    for (const field of flattenFields(profileQuery.data.groups)) {
      nextDrafts[field.id] = field.value
    }
    setDrafts(nextDrafts)
  }, [profileQuery.data])

  useEffect(() => {
    if (!requestedField || fields.length === 0) return
    const field = fields.find((item) => item.id === requestedField)
    if (!field) return
    setActiveGroup(field.group_id)
    window.setTimeout(() => {
      document.getElementById(`field-${field.id}`)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      })
      document.getElementById(`input-${field.id}`)?.focus()
    }, 80)
  }, [fields, requestedField])

  const dirtyFields = useMemo(() => {
    const dirty: Record<string, string> = {}
    for (const field of fields) {
      const draft = drafts[field.id] ?? ""
      if (draft !== field.value) dirty[field.id] = draft
    }
    return dirty
  }, [drafts, fields])

  const dirtyCount = Object.keys(dirtyFields).length
  const progress = useMemo(() => countDrafts(groups, drafts), [groups, drafts])
  const progressPct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0

  const handleSave = async () => {
    if (dirtyCount === 0) return
    setSaving(true)
    try {
      const res = await saveCompanyProfile(dirtyFields)
      toast.success("Dados da empresa salvos", {
        description:
          res.updated > 0
            ? `${res.updated} campo${res.updated > 1 ? "s" : ""} atualizado${res.updated > 1 ? "s" : ""}.`
            : "Nenhuma alteração enviada.",
      })
      await qc.invalidateQueries({ queryKey: ["company-profile"] })
      await qc.invalidateQueries({ queryKey: ["company-onboarding"] })
      await qc.invalidateQueries({ queryKey: ["pendencias"] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast.error("Falha ao salvar", { description: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleFieldChange = (fieldID: string, value: string) => {
    setDrafts((current) => ({ ...current, [fieldID]: value }))
  }

  if (profileQuery.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Dados da empresa" />
        <LoadingState />
      </div>
    )
  }

  if (profileQuery.isError) {
    const msg =
      profileQuery.error instanceof Error
        ? profileQuery.error.message
        : "Falha ao carregar dados"
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Dados da empresa">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => profileQuery.refetch()}
            disabled={profileQuery.isFetching}
          >
            <IconRefresh data-icon="inline-start" />
            Recarregar
          </Button>
        </PageHeader>
        <div className="flex flex-1 items-center justify-center px-6 pb-6">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Não foi possível carregar</CardTitle>
              <CardDescription>{msg}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Dados da empresa">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => profileQuery.refetch()}
          disabled={profileQuery.isFetching || saving}
        >
          {profileQuery.isFetching ? (
            <IconLoader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <IconRefresh data-icon="inline-start" />
          )}
          Recarregar
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={dirtyCount === 0 || saving}
        >
          {saving ? (
            <IconLoader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <IconDeviceFloppy data-icon="inline-start" />
          )}
          Salvar
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-24">
        <section className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card>
            <CardHeader>
              <CardTitle>Informações que os agentes usam</CardTitle>
              <CardDescription>
                Os campos abaixo atualizam os arquivos em{" "}
                <code>workspace/</code> e alimentam atendimento, vendas, suporte
                e marketing.
              </CardDescription>
              <CardAction>
                <Badge variant={progress.missing > 0 ? "secondary" : "default"}>
                  {progressPct}% completo
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="bg-muted h-2 overflow-hidden rounded-md">
                <div
                  className="bg-primary h-full rounded-md transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5">
                  <IconCircleCheck className="size-4" />
                  {progress.completed} preenchidos
                </span>
                <span className="flex items-center gap-1.5">
                  <IconCircleDashed className="size-4" />
                  {progress.missing} faltando
                </span>
                <span className="flex items-center gap-1.5">
                  <IconUsers className="size-4" />
                  {fields.length} campos mapeados
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
              <CardDescription>
                {dirtyCount > 0
                  ? `${dirtyCount} alteração${dirtyCount > 1 ? "es" : ""} ainda não salva${dirtyCount > 1 ? "s" : ""}.`
                  : "Tudo sincronizado com os Markdown do tenant."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Workspace</span>
                <Badge variant="outline">{profileQuery.data?.workspace}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Fonte</span>
                <Badge variant="outline">Markdown</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <Tabs value={activeGroup} onValueChange={setActiveGroup}>
          <div className="overflow-x-auto pb-1">
            <TabsList>
              {groups.map((group) => (
                <TabsTrigger key={group.id} value={group.id}>
                  {group.title}
                  <Badge variant={group.missing > 0 ? "secondary" : "outline"}>
                    {group.completed}/{group.total}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {groups.map((group) => (
            <TabsContent key={group.id} value={group.id}>
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-medium">{group.title}</h2>
                  <p className="text-muted-foreground max-w-3xl text-sm">
                    {group.description}
                  </p>
                </div>
                <FieldGroup className="grid gap-4 lg:grid-cols-2">
                  {group.fields.map((field) => {
                    const value = drafts[field.id] ?? ""
                    const status = draftStatus(field, value)
                    const invalid = field.required && status === "missing"
                    return (
                      <Card
                        key={field.id}
                        id={`field-${field.id}`}
                        size="sm"
                        className={cn(
                          "scroll-mt-24",
                          requestedField === field.id && "ring-primary/40",
                        )}
                      >
                        <CardHeader>
                          <CardTitle className="flex flex-wrap items-center gap-2">
                            {field.label}
                            {field.required ? (
                              <Badge variant="secondary">obrigatório</Badge>
                            ) : null}
                          </CardTitle>
                          <CardDescription>{field.description}</CardDescription>
                          <CardAction>
                            <StatusBadge status={status} />
                          </CardAction>
                        </CardHeader>
                        <CardContent>
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor={`input-${field.id}`}>
                              {field.markdown_label}
                            </FieldLabel>
                            {field.kind === "textarea" ? (
                              <Textarea
                                id={`input-${field.id}`}
                                value={value}
                                onChange={(event) =>
                                  handleFieldChange(
                                    field.id,
                                    event.target.value,
                                  )
                                }
                                aria-invalid={invalid}
                                rows={5}
                              />
                            ) : field.kind === "select" ? (
                              <Select
                                value={value}
                                onValueChange={(next) =>
                                  handleFieldChange(field.id, next)
                                }
                              >
                                <SelectTrigger
                                  id={`input-${field.id}`}
                                  aria-invalid={invalid}
                                  className="w-full"
                                >
                                  <SelectValue placeholder="Selecionar" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {(field.options ?? []).map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                id={`input-${field.id}`}
                                value={value}
                                onChange={(event) =>
                                  handleFieldChange(
                                    field.id,
                                    event.target.value,
                                  )
                                }
                                aria-invalid={invalid}
                              />
                            )}
                            <FieldDescription>
                              Salva em <code>{field.source}</code>.
                            </FieldDescription>
                          </Field>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {field.agents.map((agent) => (
                              <Badge key={agent} variant="outline">
                                usado por {agent}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </FieldGroup>
              </section>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {dirtyCount > 0 ? (
        <div className="bg-background/95 border-border/60 fixed right-0 bottom-0 left-0 border-t px-6 py-3 backdrop-blur">
          <div className="ml-auto flex max-w-5xl items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">
              {dirtyCount} alteração{dirtyCount > 1 ? "es" : ""} sem salvar
            </span>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <IconLoader2
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              Salvar dados
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
