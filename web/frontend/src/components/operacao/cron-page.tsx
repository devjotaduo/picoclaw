import {
  IconAlertCircle,
  IconCalendarTime,
  IconCheck,
  IconLoader2,
  IconPlayerPause,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"

import { listCronJobs, type CronJob } from "@/api/cron"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function fmtTime(ms?: number): string {
  if (!ms) return "—"
  try {
    return new Date(ms).toLocaleString("pt-BR")
  } catch {
    return "—"
  }
}

function fmtSchedule(job: CronJob): string {
  const s = job.schedule
  if (s.expr) return s.expr + (s.tz ? ` (${s.tz})` : "")
  if (s.everyMs) {
    const m = Math.round(s.everyMs / 60000)
    if (m % 1440 === 0) return `a cada ${m / 1440} dia${m / 1440 > 1 ? "s" : ""}`
    if (m % 60 === 0) return `a cada ${m / 60} h`
    return `a cada ${m} min`
  }
  if (s.atMs) return `uma vez em ${fmtTime(s.atMs)}`
  return s.kind || "—"
}

function statusBadge(job: CronJob) {
  const status = job.state.lastStatus
  if (!status) {
    return (
      <span className="text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5 text-xs">
        nunca rodou
      </span>
    )
  }
  if (status === "ok" || status === "success") {
    return (
      <span className="text-success bg-success/15 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
        <IconCheck className="size-3" />
        ok
      </span>
    )
  }
  return (
    <span className="text-destructive bg-destructive/15 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
      <IconX className="size-3" />
      {status}
    </span>
  )
}

export function CronPage() {
  const query = useQuery({
    queryKey: ["cron-jobs"],
    queryFn: listCronJobs,
    refetchInterval: 15_000,
  })

  const jobs = query.data?.jobs ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Cron / batimentos">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconRefresh className="size-4" />
          )}
          <span className="ml-1.5">Recarregar</span>
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {query.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Carregando jobs...
          </div>
        ) : query.isError ? (
          <div className="text-destructive flex items-start gap-2 text-sm">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {(query.error as Error)?.message || "Erro ao carregar jobs"}
            </span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="border-border/40 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm">
            <IconCalendarTime className="size-10 opacity-40" />
            <p className="font-medium">Nenhum job agendado.</p>
            <p className="max-w-md text-center text-xs opacity-70">
              Jobs criados via skill <code>cron</code> ou pelos batimentos
              automáticos (ex: <code>lia-marketing-daily</code>) aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="border-border/40 bg-card overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Job</th>
                  <th className="px-3 py-2 text-left font-medium">Schedule</th>
                  <th className="px-3 py-2 text-left font-medium">Próximo</th>
                  <th className="px-3 py-2 text-left font-medium">Último</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-border/20 divide-y">
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className={cn(!job.enabled && "opacity-50")}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{job.name || job.id}</div>
                      {job.payload.agent_id ? (
                        <div className="text-muted-foreground text-xs">
                          agente: {job.payload.agent_id}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {fmtSchedule(job)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {fmtTime(job.state.nextRunAtMs)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {fmtTime(job.state.lastRunAtMs)}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(job)}</td>
                    <td className="px-3 py-2.5">
                      {job.enabled ? (
                        <span className="text-success text-xs">ativo</span>
                      ) : (
                        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                          <IconPlayerPause className="size-3" />
                          pausado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {query.data?.store_path ? (
              <p className="text-muted-foreground border-border/30 border-t px-3 py-2 text-xs">
                Fonte: <code>{query.data.store_path}</code>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
