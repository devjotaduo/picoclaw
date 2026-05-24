import {
  IconAlertTriangle,
  IconBell,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconChartBar,
  IconCheck,
  IconChecklist,
  IconDeviceFloppy,
  IconExternalLink,
  IconFileAnalytics,
  IconFileText,
  IconLoader2,
  IconPhoto,
  IconRefresh,
  IconSparkles,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { ComponentType, ReactNode } from "react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  type AgentDashboardArtifact,
  type AgentDashboardItem,
  type AgentDashboardTask,
  getAgentDashboard,
  postAgentDashboardResponse,
} from "@/api/agent-dashboard"
import {
  type WhatsAppChat,
  getWhatsAppReport,
  listWhatsAppChats,
} from "@/api/whatsapp"
import { AIOrbAvatar } from "@/components/chat/ai-orb-avatar"
import { PageHeader } from "@/components/page-header"
import { type ApprovalDecision } from "@/components/tool-ui/approval-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  actionableDashboardItems,
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
import { cn } from "@/lib/utils"

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
  const items = dashboard?.items ?? []
  const tasks = dashboard?.tasks ?? []
  const agents = dashboard?.agents ?? []
  const artifacts = dashboard?.artifacts ?? []
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
  const attentionItems = actionableDashboardItems(items).slice(0, 6)
  const recentItems = recentDashboardItems(items, 8)
  const reportItems = recentItems.filter((item) =>
    ["analysis", "report", "metric"].includes(item.type),
  )
  const visibleTasks = [...tasks]
    .sort((a, b) => dashboardTaskStamp(b).localeCompare(dashboardTaskStamp(a)))
    .slice(0, 8)

  // Cada panel só renderiza quando tem conteúdo — modo minimalista.
  // Não conta `agents.length` (sempre > 0 com agentes registrados) nem
  // `items.length` cru (pode incluir items não-actionable). Conta apenas
  // o que de fato vai renderizar.
  const hasAttention = attentionItems.length > 0
  const hasReports = reportItems.length > 0
  const hasArtifacts = artifacts.length > 0
  const hasTasks = visibleTasks.length > 0
  const hasWhatsAppPulse = chats.length > 0
  const hasAnyDashboardData =
    hasAttention || hasReports || hasArtifacts || hasTasks || hasWhatsAppPulse

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
                    tone={dashboard.metrics.alerts > 0 ? "warning" : "default"}
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

              {!hasAnyDashboardData ? (
                <StatePanel
                  icon={<IconSparkles className="size-5" />}
                  title="Nenhum resultado publicado ainda"
                  detail="Quando um agente precisar de confirmação ou gerar um arquivo, ele aparece aqui para você revisar e salvar a resposta."
                />
              ) : null}

              {/*
                Layout minimalista: cada painel só aparece quando tem
                conteúdo real. Os 2 painéis removidos eram redundantes —
                "Resultados dos agentes" listava todos os agentes com
                "0 itens" (info já no KPI "Agentes ativos"), e "Sugestões
                e melhorias" só mostrava conteúdo seed das memórias.
              */}
              {hasAttention || hasWhatsAppPulse ? (
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
                      badge={`${attentionItems.length} itens`}
                    >
                      <AgentChatList
                        items={attentionItems}
                        drafts={drafts}
                        approvalChoices={approvalChoices}
                        saving={saveResponseMutation.isPending}
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
              ) : null}

              {hasReports ? (
                <Panel
                  title="Relatórios e análises"
                  icon={<IconChartBar className="size-4" />}
                >
                  <InsightList items={reportItems.slice(0, 5)} />
                </Panel>
              ) : null}

              {hasArtifacts ? (
                <Panel
                  title="Arquivos e links gerados"
                  icon={<IconExternalLink className="size-4" />}
                  badge={`${artifacts.length} entregas`}
                >
                  <ArtifactGallery artifacts={artifacts} />
                </Panel>
              ) : null}

              {hasTasks ? (
                <Panel
                  title="Próximos lembretes"
                  icon={<IconChecklist className="size-4" />}
                  badge={`${visibleTasks.length} ativos`}
                >
                  <TaskList tasks={visibleTasks} />
                </Panel>
              ) : null}
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
    <section
      className={cn("bg-card/85 rounded-lg border shadow-sm", className)}
    >
      <div className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-foreground truncate text-sm font-semibold">
            {title}
          </h2>
        </div>
        {badge ? <Badge variant="outline">{badge}</Badge> : null}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  )
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
    <div className="space-y-3">
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
  const agentName = friendlyAgentName(item)
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
    <div className="space-y-3">
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
    <div className="space-y-5">
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
