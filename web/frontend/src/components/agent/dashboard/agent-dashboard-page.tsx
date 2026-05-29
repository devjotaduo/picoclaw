import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconBell,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconChartBar,
  IconChartLine,
  IconCheck,
  IconChecklist,
  IconChevronRight,
  IconDeviceFloppy,
  IconExternalLink,
  IconFileAnalytics,
  IconFileText,
  IconLayoutDashboard,
  IconLoader2,
  IconMessages,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTable,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { ComponentType, ReactNode } from "react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  type AgentDashboardAgent,
  type AgentDashboardArtifact,
  type AgentDashboardItem,
  type AgentDashboardResponse,
  type AgentDashboardTask,
  getAgentDashboard,
  postAgentDashboardResponse,
} from "@/api/agent-dashboard"
import {
  type WhatsAppChat,
  getWhatsAppReport,
  listWhatsAppChats,
} from "@/api/whatsapp"
import { CatarinaProgressCard } from "@/components/agent/dashboard/catarina-progress-card"
import { OnboardingLifecycleCard } from "@/components/agent/dashboard/onboarding-lifecycle-card"
import { TenantStatusBanner } from "@/components/agent/dashboard/tenant-status-banner"
import { AIOrbAvatar } from "@/components/chat/ai-orb-avatar"
import { PageHeader } from "@/components/page-header"
import { type ApprovalDecision } from "@/components/tool-ui/approval-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type AgentDashboardWorkSummary,
  actionableDashboardItems,
  buildAgentDashboardWorkSummaries,
  compactDashboardCount,
  dashboardArtifactLabel,
  dashboardItemStamp,
  dashboardPriorityLabel,
  dashboardStatusLabel,
  dashboardTaskStamp,
  dashboardTypeLabel,
  formatDashboardDate,
  friendlyAgentName,
  friendlyDashboardSourceLabel,
  friendlyDashboardText,
  friendlyTaskSchedule,
  friendlyTaskTitle,
  recentDashboardItems,
} from "@/lib/agent-dashboard"
import {
  ALL_FILTER,
  type DashboardFilters,
  type DashboardSourceFilter,
  type DashboardStatusFilter,
  dashboardArtifactMatchesFilters,
  dashboardItemMatchesFilters,
  dashboardTaskMatchesFilters,
  filterAgentWorkSummaries,
} from "@/lib/agent-dashboard-filters"
import { cn } from "@/lib/utils"

type DashboardTab = "overview" | "agents" | "queue" | "reports" | "settings"

export function AgentDashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ["agent-dashboard"],
    queryFn: getAgentDashboard,
    refetchInterval: 30_000,
  })
  const chatsQuery = useQuery({
    queryKey: ["agent-dashboard", "whatsapp", "chats"],
    queryFn: () => listWhatsAppChats(200),
    retry: false,
    refetchInterval: 30_000,
  })
  const reportQuery = useQuery({
    queryKey: ["agent-dashboard", "whatsapp", "report", 7],
    queryFn: () => {
      const now = Date.now()
      return getWhatsAppReport({
        from: now - 7 * 24 * 60 * 60 * 1000,
        to: now,
      })
    },
    retry: false,
    refetchInterval: 60_000,
  })

  const dashboard = dashboardQuery.data
  const items = useMemo(() => dashboard?.items ?? [], [dashboard?.items])
  const tasks = useMemo(() => dashboard?.tasks ?? [], [dashboard?.tasks])
  const agents = useMemo(() => dashboard?.agents ?? [], [dashboard?.agents])
  const artifacts = useMemo(
    () => dashboard?.artifacts ?? [],
    [dashboard?.artifacts],
  )
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview")
  const [queryFilter, setQueryFilter] = useState("")
  const [agentFilter, setAgentFilter] = useState(ALL_FILTER)
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>("all")
  const [sourceFilter, setSourceFilter] = useState<DashboardSourceFilter>("all")
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [approvalChoices, setApprovalChoices] = useState<
    Record<string, ApprovalDecision>
  >({})
  const saveResponseMutation = useMutation({
    mutationFn: postAgentDashboardResponse,
    onSuccess: (saved) => {
      const key =
        saved.item_id && saved.item_source
          ? `${saved.item_source}:${saved.item_id}`
          : saved.item_id || saved.id
      setDrafts((current) => ({ ...current, [key]: "" }))
      toast.success("Informação salva para o agente.")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a informação.",
      )
    },
  })
  const chats = useMemo(() => chatsQuery.data ?? [], [chatsQuery.data])
  const whatsapp = useMemo(() => summarizeWhatsApp(chats), [chats])
  const agentWork = useMemo(
    () =>
      buildAgentDashboardWorkSummaries({
        agents,
        items,
        tasks,
        artifacts,
      }),
    [agents, items, tasks, artifacts],
  )
  const filters = useMemo<DashboardFilters>(
    () => ({
      query: queryFilter,
      agentId: agentFilter,
      status: statusFilter,
      source: sourceFilter,
    }),
    [agentFilter, queryFilter, sourceFilter, statusFilter],
  )
  const selectedFilterSummary = useMemo(
    () =>
      agentFilter === ALL_FILTER
        ? undefined
        : agentWork.find((summary) => summary.agent.id === agentFilter),
    [agentFilter, agentWork],
  )
  const selectedAgentSummary = useMemo(
    () =>
      selectedAgentId
        ? agentWork.find((summary) => summary.agent.id === selectedAgentId)
        : undefined,
    [agentWork, selectedAgentId],
  )
  const scopedItems = selectedFilterSummary?.items ?? items
  const scopedTasks = selectedFilterSummary?.tasks ?? tasks
  const scopedArtifacts = selectedFilterSummary?.artifacts ?? artifacts
  const filteredAgentWork = useMemo(
    () => filterAgentWorkSummaries(agentWork, filters),
    [agentWork, filters],
  )
  const filteredAttentionItems = actionableDashboardItems(
    scopedItems.filter((item) => dashboardItemMatchesFilters(item, filters)),
  ).slice(0, 12)
  const filteredReportItems = recentDashboardItems(
    scopedItems.filter(
      (item) =>
        ["analysis", "report", "metric"].includes(item.type) &&
        dashboardItemMatchesFilters(item, filters),
    ),
    12,
  )
  const filteredVisibleTasks = scopedTasks
    .filter((task) => dashboardTaskMatchesFilters(task, filters))
    .sort((a, b) => dashboardTaskStamp(b).localeCompare(dashboardTaskStamp(a)))
    .slice(0, 12)
  const filteredArtifacts = scopedArtifacts
    .filter((artifact) => dashboardArtifactMatchesFilters(artifact, filters))
    .slice(0, 12)
  // Cada panel só renderiza quando tem conteúdo — modo minimalista.
  // Não conta `agents.length` (sempre > 0 com agentes registrados) nem
  // `items.length` cru (pode incluir items não-actionable). Conta apenas
  // o que de fato vai renderizar.
  const hasAttention = filteredAttentionItems.length > 0
  const hasReports = filteredReportItems.length > 0
  const hasArtifacts = filteredArtifacts.length > 0
  const hasTasks = filteredVisibleTasks.length > 0
  const hasAgentWork = filteredAgentWork.length > 0
  const hasWhatsAppPulse = chats.length > 0
  const hasAnyDashboardData =
    hasAttention ||
    hasReports ||
    hasArtifacts ||
    hasTasks ||
    hasAgentWork ||
    hasWhatsAppPulse

  // KPIs row só renderiza quando ao menos um número for relevante OU o
  // WhatsApp estiver offline (estado que vale comunicar).
  const kpisHaveData =
    dashboard?.metrics?.pending_items != null &&
    (dashboard.metrics.pending_items > 0 ||
      dashboard.metrics.reports > 0 ||
      dashboard.metrics.active_tasks > 0 ||
      dashboard.metrics.alerts > 0 ||
      whatsapp.unread > 0 ||
      chatsQuery.isError)

  const handleDraftChange = (item: AgentDashboardItem, value: string) => {
    setDrafts((current) => ({
      ...current,
      [dashboardItemKey(item)]: value,
    }))
  }

  const handleSaveResponse = (item: AgentDashboardItem) => {
    const key = dashboardItemKey(item)
    const message = drafts[key]?.trim()
    if (!message) {
      return
    }
    saveResponseMutation.mutate({
      item_id: item.id,
      item_source: item.source,
      agent_id: item.agent_id,
      agent_name: item.agent_name,
      message,
    })
  }

  const handleApprovalDecision = (
    item: AgentDashboardItem,
    decision: ApprovalDecision,
  ) => {
    const key = dashboardItemKey(item)
    setApprovalChoices((current) => ({ ...current, [key]: decision }))
    saveResponseMutation.mutate({
      item_id: item.id,
      item_source: item.source,
      agent_id: item.agent_id,
      agent_name: item.agent_name,
      message:
        decision === "approved"
          ? "Aprovado pelo cartão Tool UI. O agente pode continuar."
          : "Recusado pelo cartão Tool UI. O agente deve aguardar revisão.",
    })
  }

  return (
    <div className="bg-background flex h-full flex-col">
      <PageHeader title="Painel dos agentes">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void dashboardQuery.refetch()
            void chatsQuery.refetch()
            void reportQuery.refetch()
          }}
          disabled={
            dashboardQuery.isFetching ||
            chatsQuery.isFetching ||
            reportQuery.isFetching
          }
        >
          <IconRefresh
            className={cn(
              "size-4",
              (dashboardQuery.isFetching ||
                chatsQuery.isFetching ||
                reportQuery.isFetching) &&
                "animate-spin",
            )}
          />
          Atualizar
        </Button>
      </PageHeader>

      <main className="from-background via-background to-muted/30 min-h-0 flex-1 overflow-y-auto border-t bg-linear-to-b px-5 py-5 pb-20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
          {dashboardQuery.isLoading ? (
            <DashboardSkeleton />
          ) : dashboardQuery.isError ? (
            <StatePanel
              icon={<IconAlertTriangle className="size-5" />}
              title="Não foi possível carregar o painel"
              detail={
                dashboardQuery.error instanceof Error
                  ? dashboardQuery.error.message
                  : "Erro ao consultar /api/agent-dashboard."
              }
              tone="danger"
            />
          ) : dashboard ? (
            <>
              {/* Status do tenant — visível sempre. Mostra em qual fase do
                  ciclo (discovery / waiting / ativo / admin) o tenant está
                  e quantos campos do empresa.md já estão preenchidos. */}
              <TenantStatusBanner />

              {dashboard.health.errors.length > 0 ||
              dashboard.health.missing_sources.length > 0 ||
              chatsQuery.isError ||
              reportQuery.isError ? (
                <HealthStrip
                  missingSources={dashboard.health.missing_sources}
                  errors={dashboard.health.errors}
                  whatsappUnavailable={
                    chatsQuery.isError || reportQuery.isError
                  }
                />
              ) : null}

              <DashboardControlBar
                filters={filters}
                agentWork={agentWork}
                onQueryChange={setQueryFilter}
                onAgentChange={setAgentFilter}
                onStatusChange={setStatusFilter}
                onSourceChange={setSourceFilter}
              />

              {!hasAnyDashboardData ? (
                <StatePanel
                  icon={<IconSparkles className="size-5" />}
                  title="Nenhum resultado publicado ainda"
                  detail="Quando um agente precisar de confirmação ou gerar um arquivo, ele aparece aqui para você revisar e salvar a resposta."
                />
              ) : null}

              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as DashboardTab)}
                className="gap-4"
              >
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:inline-flex md:w-fit">
                  <TabsTrigger value="overview">
                    <IconLayoutDashboard className="size-4" />
                    Geral
                  </TabsTrigger>
                  <TabsTrigger value="agents">
                    <IconUsers className="size-4" />
                    Agentes
                  </TabsTrigger>
                  <TabsTrigger value="queue">
                    <IconMessages className="size-4" />
                    Fila
                  </TabsTrigger>
                  <TabsTrigger value="reports">
                    <IconChartLine className="size-4" />
                    Relatórios
                  </TabsTrigger>
                  <TabsTrigger value="settings">
                    <IconSettings className="size-4" />
                    Operação
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="flex flex-col gap-4">
                  <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
                    <OnboardingLifecycleCard />
                    <CatarinaProgressCard />
                  </section>

                  {kpisHaveData ? (
                    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <KpiCard
                        icon={IconUsers}
                        label="Agentes ativos"
                        value={`${dashboard.metrics.active_agents}/${dashboard.metrics.agents}`}
                        detail={`${compactDashboardCount(agents.length)} no painel`}
                      />
                      <KpiCard
                        icon={IconBell}
                        label="Pendências"
                        value={dashboard.metrics.pending_items}
                        detail={`${dashboard.metrics.alerts} alertas`}
                        tone={
                          dashboard.metrics.alerts > 0 ? "warning" : "default"
                        }
                      />
                      <KpiCard
                        icon={IconFileAnalytics}
                        label="Relatórios"
                        value={dashboard.metrics.reports}
                        detail="análises salvas"
                      />
                      <KpiCard
                        icon={IconCalendarEvent}
                        label="Tarefas ativas"
                        value={dashboard.metrics.active_tasks}
                        detail={`${tasks.length} lembretes`}
                      />
                      <KpiCard
                        icon={IconBrandWhatsapp}
                        label="WhatsApp"
                        value={
                          chatsQuery.isError
                            ? "offline"
                            : compactDashboardCount(whatsapp.unread)
                        }
                        detail={
                          chatsQuery.isError
                            ? "gateway indisponível"
                            : `${whatsapp.handoffs} pausados`
                        }
                        tone={chatsQuery.isError ? "danger" : "default"}
                      />
                    </section>
                  ) : null}

                  {hasAgentWork ? (
                    <Panel
                      title="Trabalho por agente"
                      icon={<IconUsers className="size-4" />}
                      badge={`${filteredAgentWork.length}/${agentWork.length} agentes`}
                    >
                      <AgentWorkGrid
                        summaries={filteredAgentWork.slice(0, 6)}
                      />
                    </Panel>
                  ) : null}

                  <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.65fr)]">
                    {hasAttention ? (
                      <Panel
                        title="Fila de atenção"
                        icon={<IconBell className="size-4" />}
                        badge={`${filteredAttentionItems.length} itens`}
                      >
                        <AgentChatList
                          items={filteredAttentionItems.slice(0, 5)}
                          drafts={drafts}
                          approvalChoices={approvalChoices}
                          saving={saveResponseMutation.isPending}
                          compact
                          onDraftChange={handleDraftChange}
                          onSave={handleSaveResponse}
                          onDecision={handleApprovalDecision}
                        />
                      </Panel>
                    ) : null}

                    {hasWhatsAppPulse ? (
                      <Panel
                        title="Pulso WhatsApp"
                        icon={<IconBrandWhatsapp className="size-4" />}
                        badge={chatsQuery.isError ? "offline" : "ao vivo"}
                      >
                        <WhatsAppPulse
                          chats={chats}
                          unavailable={chatsQuery.isError}
                          messages={reportQuery.data?.messages}
                          leads={reportQuery.data?.qualified_leads}
                        />
                      </Panel>
                    ) : null}
                  </section>
                </TabsContent>

                <TabsContent value="agents" className="flex flex-col gap-4">
                  <Panel
                    title="Agentes e entregas"
                    icon={<IconTable className="size-4" />}
                    badge={`${filteredAgentWork.length} visíveis`}
                  >
                    <AgentWorkOperations
                      summaries={filteredAgentWork}
                      onSelect={(summary) =>
                        setSelectedAgentId(summary.agent.id)
                      }
                    />
                  </Panel>
                </TabsContent>

                <TabsContent value="queue" className="flex flex-col gap-4">
                  <section
                    className={cn(
                      "grid gap-4",
                      hasAttention && hasWhatsAppPulse
                        ? "xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]"
                        : "",
                    )}
                  >
                    {hasAttention ? (
                      <Panel
                        title="Fila de atenção"
                        icon={<IconBell className="size-4" />}
                        badge={`${filteredAttentionItems.length} itens`}
                      >
                        <AgentChatList
                          items={filteredAttentionItems}
                          drafts={drafts}
                          approvalChoices={approvalChoices}
                          saving={saveResponseMutation.isPending}
                          onDraftChange={handleDraftChange}
                          onSave={handleSaveResponse}
                          onDecision={handleApprovalDecision}
                        />
                      </Panel>
                    ) : (
                      <StatePanel
                        icon={<IconCheck className="size-5" />}
                        title="Nada aguardando decisão"
                        detail="Os filtros atuais não retornaram pendências de agentes."
                        compact
                      />
                    )}

                    {hasWhatsAppPulse ? (
                      <Panel
                        title="Pulso WhatsApp"
                        icon={<IconBrandWhatsapp className="size-4" />}
                        badge={chatsQuery.isError ? "offline" : "ao vivo"}
                      >
                        <WhatsAppPulse
                          chats={chats}
                          unavailable={chatsQuery.isError}
                          messages={reportQuery.data?.messages}
                          leads={reportQuery.data?.qualified_leads}
                        />
                      </Panel>
                    ) : null}
                  </section>
                </TabsContent>

                <TabsContent value="reports" className="flex flex-col gap-4">
                  {hasReports ? (
                    <Panel
                      title="Relatórios, dados e análises"
                      icon={<IconChartBar className="size-4" />}
                      badge={`${filteredReportItems.length} registros`}
                    >
                      <InsightList items={filteredReportItems} />
                    </Panel>
                  ) : null}

                  {hasTasks ? (
                    <Panel
                      title="Planos e próximas ações"
                      icon={<IconChecklist className="size-4" />}
                      badge={`${filteredVisibleTasks.length} ativos`}
                    >
                      <TaskList tasks={filteredVisibleTasks} />
                    </Panel>
                  ) : null}

                  {hasArtifacts ? (
                    <Panel
                      title="Arquivos e links gerados"
                      icon={<IconExternalLink className="size-4" />}
                      badge={`${filteredArtifacts.length} entregas`}
                    >
                      <ArtifactGallery artifacts={filteredArtifacts} />
                    </Panel>
                  ) : null}

                  {!hasReports && !hasTasks && !hasArtifacts ? (
                    <StatePanel
                      icon={<IconFileText className="size-5" />}
                      title="Sem relatórios para os filtros atuais"
                      detail="Remova filtros por origem ou agente para ampliar a visão."
                      compact
                    />
                  ) : null}
                </TabsContent>

                <TabsContent value="settings" className="flex flex-col gap-4">
                  <OperationalReadinessPanel
                    dashboard={dashboard}
                    chatsUnavailable={chatsQuery.isError}
                    reportUnavailable={reportQuery.isError}
                    filters={filters}
                    agentWork={agentWork}
                    filteredAgentWork={filteredAgentWork}
                  />
                </TabsContent>
              </Tabs>

              <AgentDetailsSheet
                summary={selectedAgentSummary}
                onOpenChange={(open) => {
                  if (!open) {
                    setSelectedAgentId(null)
                  }
                }}
              />
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: number | string
  detail: string
  tone?: "default" | "warning" | "danger"
}) {
  return (
    <div
      className={cn(
        "bg-card/80 rounded-lg border px-4 py-3 shadow-sm",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10",
        tone === "danger" && "border-destructive/30 bg-destructive/10",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
      </div>
      <div className="text-foreground mt-3 text-2xl font-semibold tracking-normal">
        {value}
      </div>
      <div className="text-muted-foreground mt-1 text-xs">{detail}</div>
    </div>
  )
}

function Panel({
  title,
  icon,
  badge,
  children,
  className,
}: {
  title: string
  icon: ReactNode
  badge?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card size="sm" className={cn("bg-card/85 gap-0 shadow-sm", className)}>
      <CardHeader className="min-h-11 border-b py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <CardTitle className="truncate text-sm font-semibold">
            {title}
          </CardTitle>
        </div>
        {badge ? (
          <CardAction>
            <Badge variant="outline">{badge}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="p-3.5">{children}</CardContent>
    </Card>
  )
}

function DashboardControlBar({
  filters,
  agentWork,
  onQueryChange,
  onAgentChange,
  onStatusChange,
  onSourceChange,
}: {
  filters: DashboardFilters
  agentWork: AgentDashboardWorkSummary[]
  onQueryChange: (value: string) => void
  onAgentChange: (value: string) => void
  onStatusChange: (value: DashboardStatusFilter) => void
  onSourceChange: (value: DashboardSourceFilter) => void
}) {
  return (
    <Card size="sm" className="bg-card/70 gap-0 shadow-sm">
      <CardHeader className="border-b py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <IconAdjustmentsHorizontal className="text-muted-foreground size-4" />
          <CardTitle className="text-sm font-semibold">
            Filtros operacionais
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-3.5 lg:grid-cols-[minmax(220px,1fr)_180px_160px_160px]">
        <div className="relative">
          <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={filters.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar agente, relatório, plano ou origem"
            className="pl-8"
          />
        </div>

        <Select value={filters.agentId} onValueChange={onAgentChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Agente" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_FILTER}>Todos os agentes</SelectItem>
              {agentWork.map((summary) => (
                <SelectItem key={summary.agent.id} value={summary.agent.id}>
                  {friendlyAgentName(summary.agent)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(value) =>
            onStatusChange(value as DashboardStatusFilter)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="actionable">Precisa ação</SelectItem>
              <SelectItem value="done">Concluídos</SelectItem>
              <SelectItem value="waiting">Sem dados</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={filters.source}
          onValueChange={(value) =>
            onSourceChange(value as DashboardSourceFilter)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Todas origens</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="output">Arquivos gerados</SelectItem>
              <SelectItem value="reports">Relatórios</SelectItem>
              <SelectItem value="plans">Planos</SelectItem>
              <SelectItem value="cron">Rotinas</SelectItem>
              <SelectItem value="tests">Testes</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

function AgentWorkGrid({
  summaries,
}: {
  summaries: AgentDashboardWorkSummary[]
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {summaries.map((summary) => (
        <AgentWorkCard key={summary.agent.id} summary={summary} />
      ))}
    </div>
  )
}

function AgentWorkOperations({
  summaries,
  onSelect,
}: {
  summaries: AgentDashboardWorkSummary[]
  onSelect: (summary: AgentDashboardWorkSummary) => void
}) {
  if (summaries.length === 0) {
    return (
      <StatePanel
        icon={<IconUsers className="size-5" />}
        title="Nenhum agente nos filtros atuais"
        detail="Remova filtros ou busque por outro nome, canal ou status."
        compact
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/30 text-muted-foreground hidden grid-cols-[minmax(180px,1.5fr)_repeat(4,minmax(74px,0.55fr))_minmax(220px,1.2fr)_36px] gap-3 border-b px-3 py-2 text-xs font-medium md:grid">
        <span>Agente</span>
        <span>Pend.</span>
        <span>Rel.</span>
        <span>Planos</span>
        <span>Arq.</span>
        <span>Última entrega</span>
        <span />
      </div>
      <div className="divide-y">
        {summaries.map((summary) => {
          const agentName = friendlyAgentName(summary.agent)
          return (
            <button
              key={summary.agent.id}
              type="button"
              className="hover:bg-muted/35 focus-visible:ring-ring grid w-full gap-3 px-3 py-3 text-left transition focus-visible:ring-2 focus-visible:outline-none md:grid-cols-[minmax(180px,1.5fr)_repeat(4,minmax(74px,0.55fr))_minmax(220px,1.2fr)_36px] md:items-center"
              onClick={() => onSelect(summary)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <AgentAvatar
                  initials={getAgentInitials(agentName)}
                  seed={agentName}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate text-sm font-semibold">
                      {agentName}
                    </span>
                    <Badge
                      variant={summary.total > 0 ? "secondary" : "outline"}
                    >
                      {summary.total > 0 ? "com dados" : "aguardando"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                    {agentRoleLabel(summary.agent)}
                  </p>
                </div>
              </div>

              <AgentWorkCell label="Pend." value={summary.pending} />
              <AgentWorkCell label="Rel." value={summary.reports} />
              <AgentWorkCell label="Planos" value={summary.plans} />
              <AgentWorkCell label="Arq." value={summary.files} />

              <div className="text-muted-foreground min-w-0 text-xs leading-5">
                <span className="text-foreground line-clamp-1 font-medium">
                  {friendlyDashboardText(summary.latest_title) ||
                    "Sem entrega publicada"}
                </span>
                {summary.latest_at ? (
                  <span>{formatDashboardDate(summary.latest_at)}</span>
                ) : null}
              </div>

              <IconChevronRight className="text-muted-foreground size-4 justify-self-end" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AgentWorkCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/25 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs md:block md:bg-transparent md:px-0 md:py-0">
      <span className="text-muted-foreground md:hidden">{label}</span>
      <span className="text-foreground font-semibold">
        {compactDashboardCount(value)}
      </span>
    </div>
  )
}

function AgentDetailsSheet({
  summary,
  onOpenChange,
}: {
  summary?: AgentDashboardWorkSummary
  onOpenChange: (open: boolean) => void
}) {
  const agentName = summary ? friendlyAgentName(summary.agent) : "Agente"
  return (
    <Sheet open={Boolean(summary)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl lg:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{agentName}</SheetTitle>
          <SheetDescription>
            {summary
              ? `${agentRoleLabel(summary.agent)} · ${summary.total} registros no painel`
              : "Detalhe do agente"}
          </SheetDescription>
        </SheetHeader>

        {summary ? (
          <div className="flex flex-col gap-4 px-4 pb-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <AgentWorkMetric label="Pend." value={summary.pending} />
              <AgentWorkMetric label="Rel." value={summary.reports} />
              <AgentWorkMetric label="Planos" value={summary.plans} />
              <AgentWorkMetric label="Arq." value={summary.files} />
            </div>

            <DetailSection title="Itens do agente" count={summary.items.length}>
              {summary.items.length ? (
                <div className="flex flex-col gap-2">
                  {summary.items.slice(0, 8).map((item) => (
                    <article
                      key={dashboardItemKey(item)}
                      className="bg-background/45 rounded-lg border px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} />
                        <Badge variant="secondary">
                          {dashboardTypeLabel(item.type)}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {formatDashboardDate(dashboardItemStamp(item))}
                        </span>
                      </div>
                      <h3 className="text-foreground mt-2 line-clamp-2 text-sm font-semibold">
                        {friendlyDashboardText(item.title)}
                      </h3>
                      {item.summary ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                          {friendlyDashboardText(item.summary)}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum item publicado por este agente.
                </p>
              )}
            </DetailSection>

            <DetailSection title="Planos" count={summary.tasks.length}>
              {summary.tasks.length ? (
                <TaskList tasks={summary.tasks.slice(0, 6)} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum plano ativo para este agente.
                </p>
              )}
            </DetailSection>

            <DetailSection title="Arquivos" count={summary.artifacts.length}>
              {summary.artifacts.length ? (
                <ArtifactGallery artifacts={summary.artifacts.slice(0, 6)} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum arquivo gerado por este agente.
                </p>
              )}
            </DetailSection>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function DetailSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <Badge variant="outline">{count}</Badge>
      </div>
      {children}
    </section>
  )
}

function OperationalReadinessPanel({
  dashboard,
  chatsUnavailable,
  reportUnavailable,
  filters,
  agentWork,
  filteredAgentWork,
}: {
  dashboard: AgentDashboardResponse
  chatsUnavailable: boolean
  reportUnavailable: boolean
  filters: DashboardFilters
  agentWork: AgentDashboardWorkSummary[]
  filteredAgentWork: AgentDashboardWorkSummary[]
}) {
  const issues = [
    ...dashboard.health.missing_sources.map((source) => ({
      title: friendlyDashboardSourceLabel(source),
      detail: source,
    })),
    ...dashboard.health.errors.map((error) => ({
      title: "Erro de leitura",
      detail: error,
    })),
    ...(chatsUnavailable
      ? [{ title: "WhatsApp offline", detail: "Gateway indisponível" }]
      : []),
    ...(reportUnavailable
      ? [{ title: "Relatório WhatsApp offline", detail: "API indisponível" }]
      : []),
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
      <Panel
        title="Fontes e prontidão"
        icon={<IconSettings className="size-4" />}
        badge={issues.length ? `${issues.length} atenção` : "ok"}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <SourceStatusCard
            title="Agentes"
            detail={`${agentWork.length} agentes conhecidos, ${filteredAgentWork.length} visíveis no filtro`}
            ok={agentWork.length > 0}
          />
          <SourceStatusCard
            title="WhatsApp"
            detail={
              chatsUnavailable ? "Gateway indisponível" : "Gateway respondendo"
            }
            ok={!chatsUnavailable}
          />
          <SourceStatusCard
            title="Relatórios e planos"
            detail={`${dashboard.metrics.reports} relatórios, ${dashboard.metrics.active_tasks} tarefas ativas`}
            ok={
              dashboard.metrics.reports > 0 ||
              dashboard.metrics.active_tasks > 0
            }
          />
          <SourceStatusCard
            title="Fila de decisão"
            detail={`${dashboard.metrics.pending_items} pendências, ${dashboard.metrics.alerts} alertas`}
            ok={dashboard.metrics.alerts === 0}
          />
        </div>
      </Panel>

      <Panel
        title="Leitura atual"
        icon={<IconAdjustmentsHorizontal className="size-4" />}
        badge="filtros"
      >
        <div className="flex flex-col gap-2 text-sm">
          <ReadinessRow label="Busca" value={filters.query || "sem busca"} />
          <ReadinessRow
            label="Agente"
            value={filters.agentId === ALL_FILTER ? "todos" : filters.agentId}
          />
          <ReadinessRow label="Status" value={filters.status} />
          <ReadinessRow label="Origem" value={filters.source} />
        </div>
      </Panel>

      {issues.length ? (
        <Panel
          title="Pontos de atenção"
          icon={<IconAlertTriangle className="size-4" />}
          badge={`${issues.length}`}
          className="xl:col-span-2"
        >
          <div className="grid gap-2 md:grid-cols-2">
            {issues.map((issue) => (
              <div
                key={`${issue.title}:${issue.detail}`}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
              >
                <div className="font-medium text-amber-800 dark:text-amber-200">
                  {issue.title}
                </div>
                <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {issue.detail}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

function SourceStatusCard({
  title,
  detail,
  ok,
}: {
  title: string
  detail: string
  ok: boolean
}) {
  return (
    <div className="bg-background/45 rounded-lg border px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground text-sm font-semibold">{title}</span>
        <Badge variant={ok ? "secondary" : "outline"}>
          {ok ? "ok" : "atenção"}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-2 text-xs leading-5">{detail}</p>
    </div>
  )
}

function ReadinessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 flex items-center justify-between gap-3 rounded-md px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground truncate text-right font-medium">
        {value}
      </span>
    </div>
  )
}

function AgentWorkCard({ summary }: { summary: AgentDashboardWorkSummary }) {
  const agentName = friendlyAgentName(summary.agent)
  const latestTitle = friendlyDashboardText(summary.latest_title)
  const latestAt = formatDashboardDate(summary.latest_at)

  return (
    <article className="bg-background/45 rounded-lg border px-3 py-3">
      <div className="flex items-start gap-3">
        <AgentAvatar initials={getAgentInitials(agentName)} seed={agentName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-foreground truncate text-sm font-semibold">
              {agentName}
            </h3>
            <Badge variant={summary.total > 0 ? "secondary" : "outline"}>
              {summary.total > 0 ? "com dados" : "aguardando"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
            {agentRoleLabel(summary.agent)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <AgentWorkMetric label="Pend." value={summary.pending} />
        <AgentWorkMetric label="Rel." value={summary.reports} />
        <AgentWorkMetric label="Planos" value={summary.plans} />
        <AgentWorkMetric label="Arq." value={summary.files} />
      </div>

      <div className="text-muted-foreground mt-3 min-h-10 text-xs leading-5">
        {latestTitle ? (
          <>
            <span className="text-foreground font-medium">Último: </span>
            <span className="line-clamp-2 block">{latestTitle}</span>
            {latestAt ? <span className="block">{latestAt}</span> : null}
          </>
        ) : (
          "Ainda sem entrega publicada no painel."
        )}
      </div>
    </article>
  )
}

function AgentWorkMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/30 rounded-md px-2 py-2 text-center">
      <div className="text-foreground text-sm font-semibold">
        {compactDashboardCount(value)}
      </div>
      <div className="text-muted-foreground mt-0.5 text-[11px]">{label}</div>
    </div>
  )
}

function agentRoleLabel(agent: AgentDashboardAgent) {
  if (agent.role && agent.role !== "Agente") {
    return agent.role
  }
  return agent.active ? "Agente ativo" : "Agente inativo"
}

function AgentChatList({
  items,
  drafts,
  approvalChoices,
  saving,
  compact = false,
  onDraftChange,
  onSave,
  onDecision,
}: {
  items: AgentDashboardItem[]
  drafts: Record<string, string>
  approvalChoices?: Record<string, ApprovalDecision>
  saving: boolean
  compact?: boolean
  onDraftChange: (item: AgentDashboardItem, value: string) => void
  onSave: (item: AgentDashboardItem) => void
  onDecision?: (item: AgentDashboardItem, decision: ApprovalDecision) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <AgentChatCard
          key={dashboardItemKey(item)}
          item={item}
          value={drafts[dashboardItemKey(item)] ?? ""}
          choice={approvalChoices?.[dashboardItemKey(item)]}
          saving={saving}
          compact={compact}
          onChange={(value) => onDraftChange(item, value)}
          onSave={() => onSave(item)}
          onDecision={
            onDecision ? (decision) => onDecision(item, decision) : undefined
          }
        />
      ))}
    </div>
  )
}

function AgentChatCard({
  item,
  value,
  choice,
  saving,
  compact,
  onChange,
  onSave,
  onDecision,
}: {
  item: AgentDashboardItem
  value: string
  choice?: ApprovalDecision
  saving: boolean
  compact?: boolean
  onChange: (value: string) => void
  onSave: () => void
  onDecision?: (decision: ApprovalDecision) => void
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const rawAgentName = friendlyAgentName(item)
  const agentName = readableApprovalAgentName(item) || rawAgentName
  const initials = getAgentInitials(agentName)
  const title = friendlyDashboardText(item.title)
  const summary = friendlyDashboardText(item.summary)
  const priority = dashboardPriorityLabel(item.priority)
  const timestamp = formatDashboardDate(dashboardItemStamp(item))
  const source = friendlyDashboardSourceLabel(item.source)

  return (
    <article className="bg-background/55 hover:border-primary/35 rounded-lg border px-3 py-3 transition-colors">
      <div className="flex items-start gap-3">
        <AgentAvatar initials={initials} seed={agentName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-semibold">
              {agentName}
            </span>
            <StatusBadge status={item.status} />
            {priority ? <Badge variant="secondary">{priority}</Badge> : null}
            {timestamp ? (
              <span className="text-muted-foreground text-xs">{timestamp}</span>
            ) : null}
          </div>

          <p className="text-foreground mt-1.5 line-clamp-2 text-sm leading-5 font-semibold">
            {title}
          </p>
          {!compact && summary ? (
            <p className="text-muted-foreground mt-1 line-clamp-1 text-sm leading-5">
              {summary}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground rounded-md border px-2 py-1">
              {source}
            </span>
            {choice ? (
              <span
                className={cn(
                  "rounded-md border px-2 py-1 font-medium",
                  choice === "approved"
                    ? "border-emerald-500/30 text-emerald-600"
                    : "border-red-500/30 text-red-600",
                )}
              >
                {choice === "approved" ? "Aprovado" : "Recusado"}
              </span>
            ) : null}
            {item.artifacts?.length ? (
              <ArtifactLinks artifacts={item.artifacts} />
            ) : null}
            <span className="min-w-2 flex-1" />
            {onDecision ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5"
                  disabled={saving}
                  onClick={() => onDecision("denied")}
                >
                  <IconX className="size-4" />
                  Recusar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 px-2.5"
                  disabled={saving}
                  onClick={() => onDecision("approved")}
                >
                  <IconCheck className="size-4" />
                  Aprovar
                </Button>
              </>
            ) : null}
            {!replyOpen && !value.trim() ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2.5"
                onClick={() => setReplyOpen(true)}
              >
                Responder
              </Button>
            ) : null}
          </div>

          {replyOpen || value.trim() ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={value}
                autoFocus
                onChange={(event) => onChange(event.target.value)}
                placeholder={`Resposta para ${readableApprovalAgentName(item)}...`}
                className="border-border/80 bg-card/70 placeholder:text-muted-foreground/70 text-foreground h-8 min-w-56 flex-1 rounded-md border px-2 text-xs outline-none"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-2.5"
                disabled={!value.trim() || saving}
                onClick={onSave}
              >
                <IconDeviceFloppy className="size-4" />
                Salvar
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function InsightList({ items }: { items: AgentDashboardItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <article
          key={dashboardItemKey(item)}
          className="bg-background/40 rounded-lg border px-3 py-3"
        >
          <div className="flex items-start gap-3">
            <AgentAvatar
              initials={getAgentInitials(friendlyAgentName(item))}
              seed={friendlyAgentName(item)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-foreground text-sm font-semibold">
                  {friendlyAgentName(item)}
                </span>
                <Badge variant="secondary">
                  {dashboardTypeLabel(item.type)}
                </Badge>
              </div>
              <h3 className="text-foreground mt-2 line-clamp-2 text-sm leading-5 font-semibold">
                {friendlyDashboardText(item.title)}
              </h3>
              {item.summary ? (
                <p className="text-muted-foreground mt-1 line-clamp-3 text-sm leading-5">
                  {friendlyDashboardText(item.summary)}
                </p>
              ) : null}
              <div className="text-muted-foreground mt-2 text-xs">
                {friendlyDashboardSourceLabel(item.source)}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function TaskList({ tasks }: { tasks: AgentDashboardTask[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {tasks.map((task) => (
        <article
          key={`${task.source}:${task.id}`}
          className="bg-background/40 rounded-lg border px-3 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-foreground text-sm leading-5 font-semibold">
                {friendlyTaskTitle(task)}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {friendlyTaskSchedule(task.schedule)}
              </p>
            </div>
            <StatusBadge status={task.status} />
          </div>
          <div className="text-muted-foreground mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <span className="text-foreground block font-medium">
                Responsável
              </span>
              {friendlyAgentName(task)}
            </div>
            <div>
              <span className="text-foreground block font-medium">
                Próxima vez
              </span>
              {formatDashboardDate(task.next_run_at || task.updated_at) ||
                "Aguardando definição"}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function ArtifactGallery({
  artifacts,
}: {
  artifacts: AgentDashboardArtifact[]
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {artifacts.map((artifact) => (
        <a
          key={artifact.id}
          href={artifact.url}
          target="_blank"
          rel="noreferrer"
          className="group bg-background/40 hover:border-primary/40 hover:bg-background/70 overflow-hidden rounded-lg border transition"
        >
          {artifact.type === "image" ? (
            <div className="bg-muted/50 aspect-[16/9] overflow-hidden">
              <img
                src={artifact.url}
                alt={artifact.title}
                className="size-full object-cover transition duration-200 group-hover:scale-[1.02]"
              />
            </div>
          ) : (
            <div className="bg-muted/30 flex aspect-[16/9] items-center justify-center">
              <ArtifactIcon type={artifact.type} />
            </div>
          )}
          <div className="p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {dashboardArtifactLabel(artifact.type)}
              </Badge>
              <IconExternalLink className="text-muted-foreground ml-auto size-4" />
            </div>
            <h3 className="text-foreground mt-2 line-clamp-2 text-sm font-semibold">
              {artifact.title}
            </h3>
            <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
              {artifact.agent_name ||
                friendlyDashboardSourceLabel(artifact.source)}
            </p>
          </div>
        </a>
      ))}
    </div>
  )
}

function ArtifactLinks({ artifacts }: { artifacts: AgentDashboardArtifact[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {artifacts.map((artifact) => (
        <a
          key={artifact.id}
          href={artifact.url}
          target="_blank"
          rel="noreferrer"
          className="border-border/70 bg-background/70 hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition"
        >
          <ArtifactIcon type={artifact.type} small />
          {dashboardArtifactLabel(artifact.type)}
        </a>
      ))}
    </div>
  )
}

function ArtifactIcon({
  type,
  small = false,
}: {
  type?: string
  small?: boolean
}) {
  const className = small ? "size-3.5" : "size-10 text-muted-foreground"
  if (type === "image") {
    return <IconPhoto className={className} />
  }
  if (type === "site" || type === "link" || type === "service") {
    return <IconWorld className={className} />
  }
  return <IconFileText className={className} />
}

function WhatsAppPulse({
  chats,
  unavailable,
  messages,
  leads,
}: {
  chats: WhatsAppChat[]
  unavailable: boolean
  messages?: number
  leads?: number
}) {
  if (unavailable) {
    return (
      <StatePanel
        icon={<IconAlertTriangle className="size-5" />}
        title="WhatsApp indisponível"
        detail="O gateway não respondeu agora. As demais fontes do dashboard continuam disponíveis."
        tone="warning"
        compact
      />
    )
  }
  const summary = summarizeWhatsApp(chats)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MiniMetric label="Conversas" value={summary.active} />
      <MiniMetric label="Não lidas" value={summary.unread} />
      <MiniMetric label="Pausadas" value={summary.handoffs} />
      <MiniMetric label="Mensagens 7d" value={messages ?? 0} />
      <MiniMetric label="Leads 7d" value={leads ?? 0} />
      <MiniMetric label="Últimas 24h" value={summary.last24h} />
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background/40 rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-foreground mt-1 text-lg font-semibold">
        {compactDashboardCount(value)}
      </div>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: AgentDashboardItem["status"] | AgentDashboardTask["status"]
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "new" && "border-blue-500/30 text-blue-500",
        status === "pending" && "border-amber-500/30 text-amber-600",
        status === "in_progress" && "border-violet-500/30 text-violet-500",
        status === "scheduled" && "border-cyan-500/30 text-cyan-600",
        (status === "done" || status === "implemented") &&
          "border-emerald-500/30 text-emerald-600",
        status === "dismissed" && "text-muted-foreground",
      )}
    >
      {dashboardStatusLabel(status)}
    </Badge>
  )
}

function HealthStrip({
  missingSources,
  errors,
  whatsappUnavailable,
}: {
  missingSources: string[]
  errors: string[]
  whatsappUnavailable: boolean
}) {
  const visible = [
    ...missingSources.map((source) => `Fonte ausente: ${source}`),
    ...errors.slice(0, 3),
    ...(whatsappUnavailable ? ["WhatsApp/gateway indisponível"] : []),
  ]
  if (visible.length === 0) {
    return null
  }
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Dados parciais</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {visible.map((entry) => (
              <span
                key={entry}
                className="bg-background/55 rounded-md px-2 py-1 text-xs"
              >
                {entry}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatePanel({
  icon,
  title,
  detail,
  tone = "default",
  compact = false,
}: {
  icon: ReactNode
  title: string
  detail: string
  tone?: "default" | "warning" | "danger"
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "bg-card flex items-start gap-3 rounded-lg border px-4 py-4 text-sm",
        compact && "bg-background/40",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10",
        tone === "danger" && "border-destructive/30 bg-destructive/10",
      )}
    >
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <div className="text-foreground font-medium">{title}</div>
        <p className="text-muted-foreground mt-1 leading-5">{detail}</p>
      </div>
    </div>
  )
}

function AgentAvatar({ initials, seed }: { initials: string; seed?: string }) {
  return (
    <div className="ring-border/50 relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white ring-1">
      <AIOrbAvatar seed={seed || initials} className="absolute inset-0" />
      <span className="relative z-10 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
        {initials}
      </span>
    </div>
  )
}

function getAgentInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return "AG"
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function readableApprovalAgentName(item: AgentDashboardItem) {
  return friendlyAgentName(item)
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*,.*$/, "")
    .trim()
}

function dashboardItemKey(item: AgentDashboardItem) {
  return `${item.source}:${item.id}`
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="bg-card rounded-lg border px-4 py-3">
            <IconLoader2 className="text-muted-foreground size-4 animate-spin" />
            <div className="bg-muted mt-4 h-7 w-20 rounded" />
            <div className="bg-muted/70 mt-2 h-3 w-28 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="bg-muted/60 h-64 rounded-lg" />
        <div className="bg-muted/60 h-64 rounded-lg" />
      </div>
    </div>
  )
}

function summarizeWhatsApp(chats: WhatsAppChat[]) {
  const now = Date.now()
  return chats.reduce(
    (acc, chat) => {
      acc.active += 1
      acc.unread += chat.unread_count || 0
      if (chat.paused) {
        acc.handoffs += 1
      }
      const ts = normalizeEpoch(chat.last_message_ts)
      if (ts > 0 && now - ts <= 24 * 60 * 60 * 1000) {
        acc.last24h += 1
      }
      return acc
    },
    { active: 0, unread: 0, handoffs: 0, last24h: 0 },
  )
}

function normalizeEpoch(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return value < 10_000_000_000 ? value * 1000 : value
}
