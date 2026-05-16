import {
  IconAlertTriangle,
  IconChartBar,
  IconClock,
  IconMessageCircle,
  IconRefresh,
  IconTag,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { getAppConfig } from "@/api/channels"
import {
  type WhatsAppDailyMetric,
  type WhatsAppLabelCount,
  type WhatsAppReport,
  getWhatsAppReport,
} from "@/api/whatsapp"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const RANGE_OPTIONS = [7, 30, 90] as const

export function WhatsAppReportsPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(7)

  const reportQuery = useQuery({
    queryKey: ["whatsapp", "reports", days],
    queryFn: () => {
      const now = Date.now()
      return getWhatsAppReport({
        from: now - days * 24 * 60 * 60 * 1000,
        to: now,
      })
    },
    refetchInterval: 60_000,
  })
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: getAppConfig,
  })

  const whatsappEnabled = useMemo(() => {
    const cfg = configQuery.data as Record<string, unknown> | undefined
    const channels = cfg?.channel_list
    if (!channels || typeof channels !== "object") return true
    const whatsapp = (channels as Record<string, unknown>).whatsapp
    if (!whatsapp || typeof whatsapp !== "object") return true
    const enabled = (whatsapp as Record<string, unknown>).enabled
    return enabled !== false
  }, [configQuery.data])

  const report = reportQuery.data

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t("navigation.whatsapp_reports", "Relatórios WhatsApp")}
      >
        <div className="flex items-center gap-2">
          <div className="border-border/60 flex rounded-lg border p-1">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                variant={days === option ? "default" : "ghost"}
                size="sm"
                onClick={() => setDays(option)}
              >
                {option}d
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void reportQuery.refetch()}
            disabled={reportQuery.isFetching}
          >
            <IconRefresh
              className={cn("size-4", reportQuery.isFetching && "animate-spin")}
            />
            {t("common.refresh", "Atualizar")}
          </Button>
        </div>
      </PageHeader>

      <main className="min-h-0 flex-1 overflow-y-auto border-t p-6">
        {!whatsappEnabled ? (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">
                {t(
                  "pages.agent.whatsapp_reports.disabled_title",
                  "Canal WhatsApp desativado na configuração",
                )}
              </div>
              <p className="text-xs opacity-90">
                {t(
                  "pages.agent.whatsapp_reports.disabled_hint",
                  "Os relatórios usam o banco já salvo, mas novos atendimentos só entram quando o canal estiver ativo.",
                )}
              </p>
            </div>
          </div>
        ) : null}

        {reportQuery.isLoading ? (
          <div className="text-muted-foreground text-sm">
            {t("common.loading", "Carregando...")}
          </div>
        ) : reportQuery.isError ? (
          <div className="text-destructive rounded-lg border px-4 py-3 text-sm">
            {reportQuery.error instanceof Error
              ? reportQuery.error.message
              : t(
                  "pages.agent.whatsapp_reports.load_error",
                  "Não foi possível carregar os relatórios.",
                )}
          </div>
        ) : report ? (
          <ReportContent report={report} />
        ) : null}
      </main>
    </div>
  )
}

function ReportContent({ report }: { report: WhatsAppReport }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<IconUsers className="size-4" />}
          label={t("pages.agent.whatsapp_reports.contacts", "Contatos ativos")}
          value={report.contacts}
          detail={`${report.new_contacts} ${t(
            "pages.agent.whatsapp_reports.new_contacts",
            "novos",
          )}`}
        />
        <MetricCard
          icon={<IconMessageCircle className="size-4" />}
          label={t("pages.agent.whatsapp_reports.messages", "Mensagens")}
          value={report.messages}
          detail={`${report.inbound_messages} in / ${report.outbound_messages} out`}
        />
        <MetricCard
          icon={<IconUserPlus className="size-4" />}
          label={t(
            "pages.agent.whatsapp_reports.qualified_leads",
            "Leads qualificados",
          )}
          value={report.qualified_leads}
          detail={`${report.handoffs} ${t(
            "pages.agent.whatsapp_reports.handoffs",
            "handoffs",
          )}`}
        />
        <MetricCard
          icon={<IconClock className="size-4" />}
          label={t(
            "pages.agent.whatsapp_reports.first_response",
            "1a resposta média",
          )}
          value={formatDuration(report.avg_first_response_seconds)}
          detail={`${report.unanswered} ${t(
            "pages.agent.whatsapp_reports.unanswered",
            "sem resposta",
          )}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ListPanel
          title={t("pages.agent.whatsapp_reports.intent", "Intenções")}
          icon={<IconChartBar className="size-4" />}
          items={report.by_intent}
        />
        <ListPanel
          title={t("pages.agent.whatsapp_reports.stage", "Etapas")}
          icon={<IconUserPlus className="size-4" />}
          items={report.by_lead_stage}
        />
        <ListPanel
          title={t("pages.agent.whatsapp_reports.products", "Produtos citados")}
          icon={<IconTag className="size-4" />}
          items={report.top_products}
        />
      </section>

      <section className="bg-card rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              {t("pages.agent.whatsapp_reports.daily", "Movimento diário")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t(
                "pages.agent.whatsapp_reports.daily_hint",
                "Entradas, respostas e contatos novos por dia.",
              )}
            </p>
          </div>
          <Badge variant="outline">{report.daily.length} dias</Badge>
        </div>
        <DailyTable rows={report.daily} />
      </section>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: number | string
  detail: string
}) {
  return (
    <div className="bg-card rounded-lg border px-4 py-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-muted-foreground mt-1 text-xs">{detail}</div>
    </div>
  )
}

function ListPanel({
  title,
  icon,
  items,
}: {
  title: string
  icon: ReactNode
  items: WhatsAppLabelCount[]
}) {
  const max = Math.max(...items.map((item) => item.count), 1)
  return (
    <div className="bg-card rounded-lg border">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="space-y-3 p-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sem dados no período.</p>
        ) : (
          items.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium">{item.label}</span>
                <span className="text-muted-foreground">{item.count}</span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function DailyTable({ rows }: { rows: WhatsAppDailyMetric[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="text-muted-foreground grid min-w-[520px] grid-cols-4 border-b px-4 py-2 text-xs font-medium">
        <div>Dia</div>
        <div>Entradas</div>
        <div>Respostas</div>
        <div>Novos contatos</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-muted-foreground px-4 py-6 text-sm">
          Sem dados no período.
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={row.date}
            className="grid min-w-[520px] grid-cols-4 border-b px-4 py-2 text-sm last:border-b-0"
          >
            <div className="font-medium">{row.date}</div>
            <div>{row.inbound}</div>
            <div>{row.outbound}</div>
            <div>{row.contacts}</div>
          </div>
        ))
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0s"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins ? `${hours}h ${mins}m` : `${hours}h`
}
