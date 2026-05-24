import {
  IconAlertTriangle,
  IconChartBar,
  IconClock,
  IconMessageCircle,
  IconRefresh,
  IconTag,
  IconUserCheck,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import type { ComponentType, ReactNode } from "react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { getChannelConfig, getWhatsAppNativeQR } from "@/api/channels"
import {
  type WhatsAppDailyMetric,
  type WhatsAppLabelCount,
  type WhatsAppReport,
  getWhatsAppReport,
} from "@/api/whatsapp"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const RANGE_OPTIONS = [7, 30, 90] as const

type ReportTab = "whatsapp" | "atendimentos" | "handoffs"

export function WhatsAppReportsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ReportTab>("whatsapp")
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(7)

  const channelConfigQuery = useQuery({
    queryKey: ["channels", "whatsapp_native", "config"],
    queryFn: () => getChannelConfig("whatsapp_native"),
    staleTime: 10_000,
  })
  const whatsappEnabled = useMemo(() => {
    const enabled = channelConfigQuery.data?.config.enabled
    return enabled !== false
  }, [channelConfigQuery.data])
  const qrQuery = useQuery({
    queryKey: ["whatsapp_native", "qr", "reports"],
    queryFn: getWhatsAppNativeQR,
    enabled: whatsappEnabled,
    refetchInterval: whatsappEnabled ? 5_000 : false,
  })
  const canLoadReports = qrQuery.data?.status === "confirmed"

  const reportQuery = useQuery({
    queryKey: ["whatsapp", "reports", days],
    queryFn: () => {
      const now = Date.now()
      return getWhatsAppReport({
        from: now - days * 24 * 60 * 60 * 1000,
        to: now,
      })
    },
    enabled: canLoadReports,
    refetchInterval: canLoadReports ? 60_000 : false,
  })

  const report = reportQuery.data
  const checkingConnection =
    channelConfigQuery.isLoading || (whatsappEnabled && qrQuery.isLoading)
  const showWhatsAppControls = tab === "whatsapp"

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.reports", "Relatório")}>
        {showWhatsAppControls ? (
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
              disabled={reportQuery.isFetching || !canLoadReports}
            >
              <IconRefresh
                className={cn(
                  "size-4",
                  reportQuery.isFetching && "animate-spin",
                )}
              />
              {t("common.refresh", "Atualizar")}
            </Button>
          </div>
        ) : null}
      </PageHeader>

      <main className="min-h-0 flex-1 overflow-y-auto border-t p-6">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ReportTab)}
          className="gap-4"
        >
          <TabsList>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="atendimentos">
              Atendimentos por agente
            </TabsTrigger>
            <TabsTrigger value="handoffs">Handoffs humanos</TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="mt-0">
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

            {checkingConnection ? (
              <div className="text-muted-foreground text-sm">
                {t("common.loading", "Carregando...")}
              </div>
            ) : !canLoadReports ? (
              <div className="text-muted-foreground flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center">
                <IconAlertTriangle className="size-6" />
                <div>
                  <h3 className="text-foreground text-sm font-medium">
                    WhatsApp Nativo desconectado
                  </h3>
                  <p className="mt-1 max-w-sm text-sm">
                    Conecte o canal na Caixa WhatsApp para carregar os
                    relatórios.
                  </p>
                </div>
              </div>
            ) : reportQuery.isLoading ? (
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
          </TabsContent>

          <TabsContent value="atendimentos" className="mt-0">
            <PlaceholderCard
              icon={IconUsers}
              title="Atendimentos por agente"
              body="Em breve: contagem de atendimentos resolvidos por Clara, Luna, Marcos, Camila e Lia, com tempo médio de resposta e taxa de handoff. Depende da skill metrics-logger ser ativada nos agentes."
              action={{ label: "Saber mais", href: "/agent/agents" }}
            />
          </TabsContent>

          <TabsContent value="handoffs" className="mt-0">
            <PlaceholderCard
              icon={IconUserCheck}
              title="Handoffs humanos"
              body="Em breve: fila de atendimentos que os agentes encaminharam pra humano, com motivo (reclamação grave, exceção comercial, pedido jurídico, etc) e tempo médio até resolução. Depende da skill handoff-human ser registrada."
              action={{
                label: "Ver atendimentos abertos",
                href: "/agent/whatsapp",
              }}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function PlaceholderCard({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="bg-card flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 py-10 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" />
      </div>
      <div className="max-w-md space-y-2">
        <h3 className="text-foreground text-base font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
      </div>
      {action ? (
        <Button asChild variant="outline" size="sm">
          <a href={action.href}>{action.label}</a>
        </Button>
      ) : null}
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
