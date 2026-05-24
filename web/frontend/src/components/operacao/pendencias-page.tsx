import {
  IconAlertCircle,
  IconArrowRight,
  IconBell,
  IconChecks,
  IconExternalLink,
  IconLoader2,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"

import { type PendenciaItem, listPendencias } from "@/api/pendencias"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { useNotifications } from "@/hooks/use-notifications"

function groupByFile(items: PendenciaItem[]): Record<string, PendenciaItem[]> {
  const out: Record<string, PendenciaItem[]> = {}
  for (const it of items) {
    if (!out[it.file]) out[it.file] = []
    out[it.file].push(it)
  }
  return out
}

function formatNotificationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function PendenciasPage() {
  const query = useQuery({
    queryKey: ["pendencias"],
    queryFn: listPendencias,
    refetchInterval: 30_000,
  })
  const {
    notifications,
    unreadCount,
    isLoading: notificationsLoading,
    markRead,
    markAllRead,
    dismiss,
    refetch: refetchNotifications,
  } = useNotifications()

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items])
  const unreadNotifications = useMemo(
    () => notifications.filter((n) => n.read_at == null),
    [notifications],
  )
  const hasPendingWork = items.length > 0 || unreadNotifications.length > 0
  const grouped = useMemo(() => groupByFile(items), [items])
  const files = Object.keys(grouped).sort()
  const isReloading = query.isFetching || notificationsLoading

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Pendências">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void query.refetch()
            void refetchNotifications()
          }}
          disabled={isReloading}
        >
          {isReloading ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconRefresh className="size-4" />
          )}
          <span className="ml-1.5">Recarregar</span>
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {query.isLoading && notificationsLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Carregando pendências...
          </div>
        ) : query.isError ? (
          <div className="text-destructive flex items-start gap-2 text-sm">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {(query.error as Error)?.message || "Erro ao carregar pendências"}
            </span>
          </div>
        ) : !hasPendingWork ? (
          <div className="border-border/40 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm">
            <IconChecks className="size-10 opacity-40" />
            <p className="font-medium">Nada pendente.</p>
            <p className="max-w-md text-center text-xs opacity-70">
              Notificações não lidas e blocos &quot;PENDENCIAS:&quot; em
              <code className="mx-1">memory/*.md</code> aparecem aqui para você
              completar.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {unreadNotifications.length > 0 ? (
              <section className="border-border/40 bg-card rounded-lg border">
                <header className="border-border/30 flex items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <IconBell className="text-muted-foreground size-4" />
                    <div className="min-w-0">
                      <h2 className="text-sm font-medium">
                        Notificações pendentes
                      </h2>
                      <p className="text-muted-foreground text-xs">
                        {unreadCount} alerta{unreadCount === 1 ? "" : "s"} não
                        lido{unreadCount === 1 ? "" : "s"} dos agentes.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllRead()}
                    className="shrink-0"
                  >
                    Marcar como lidas
                  </Button>
                </header>
                <ul className="divide-border/20 divide-y">
                  {unreadNotifications.map((notification) => (
                    <li
                      key={notification.id}
                      className="flex items-start gap-3 px-4 py-3 text-sm"
                    >
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="text-foreground/90 font-medium">
                            {notification.title}
                          </p>
                          <span className="text-muted-foreground text-xs">
                            {formatNotificationTime(notification.created_at)}
                          </span>
                          {notification.agent_id ? (
                            <span className="text-muted-foreground text-xs">
                              via {notification.agent_id}
                            </span>
                          ) : null}
                        </div>
                        {notification.body ? (
                          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                            {notification.body}
                          </p>
                        ) : null}
                        {notification.cta_url ? (
                          <a
                            href={notification.cta_url}
                            className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            {notification.cta_label || "Abrir"}
                            <IconExternalLink className="size-3" />
                          </a>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markRead(notification)}
                        >
                          Resolvido
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Dispensar notificação"
                          onClick={() => dismiss(notification.id)}
                        >
                          <IconX className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {items.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                {items.length} item{items.length === 1 ? "" : "s"} pendente
                {items.length === 1 ? "" : "s"} em {files.length} arquivo
                {files.length === 1 ? "" : "s"}. Estes campos foram solicitados
                pelos agentes — preencha em <code>Memória</code> para que eles
                passem a usar no próximo turno.
              </p>
            ) : null}
            {files.map((file) => (
              <section
                key={file}
                className="border-border/40 bg-card rounded-lg border"
              >
                <header className="border-border/30 flex items-center justify-between border-b px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/90 text-sm font-medium">
                      {file}
                    </span>
                    <span className="text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 text-xs">
                      {grouped[file].length}
                    </span>
                  </div>
                  <Link
                    to="/memory"
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    Abrir no editor
                    <IconArrowRight className="size-3" />
                  </Link>
                </header>
                <ul className="divide-border/20 divide-y">
                  {grouped[file].map((item) => (
                    <li
                      key={`${file}-${item.line}`}
                      className="flex items-start gap-3 px-4 py-2.5 text-sm"
                    >
                      <span className="text-muted-foreground bg-muted/40 mt-0.5 rounded px-1.5 py-0.5 font-mono text-xs">
                        L{item.line}
                      </span>
                      <div className="min-w-0 flex-1">
                        {item.heading ? (
                          <p className="text-muted-foreground mb-0.5 text-xs tracking-wide uppercase opacity-70">
                            {item.heading}
                          </p>
                        ) : null}
                        <p className="text-foreground/90">{item.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
