import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconCircleDot,
  IconCircleX,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import {
  type AgentReadiness,
  type AgentReadinessStatus,
  getReadiness,
} from "@/api/readiness"
import { PageHeader } from "@/components/page-header"
import { ValidateReadinessCard } from "@/components/operacao/validate-readiness-card"
import { Button } from "@/components/ui/button"

function statusBadge(status: AgentReadinessStatus) {
  switch (status) {
    case "ok":
      return {
        icon: <IconCircleCheck className="size-4" />,
        label: "Pronto",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      }
    case "partial":
      return {
        icon: <IconCircleDot className="size-4" />,
        label: "Parcial",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      }
    case "blocked":
      return {
        icon: <IconCircleX className="size-4" />,
        label: "Bloqueado",
        className: "bg-red-500/10 text-red-600 dark:text-red-400",
      }
    default:
      return {
        icon: <IconAlertTriangle className="size-4" />,
        label: "?",
        className: "bg-muted text-muted-foreground",
      }
  }
}

const sourceLabels: Record<string, string> = {
  "canais-autorizados": "Canais autorizados",
  empresa: "Empresa",
  faq: "Perguntas frequentes",
  marca: "Marca",
  marketing: "Marketing",
}

function readableSource(value: string) {
  const source = value.replace(/\.md$/i, "")
  return (
    sourceLabels[source] ??
    source
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}

function splitReasonSource(reason: string) {
  const match = reason.match(/^([^:]+?)(?:\.md)?:\s*(.+)$/i)
  if (!match) {
    return { source: "", detail: reason.trim() }
  }
  return { source: readableSource(match[1].trim()), detail: match[2].trim() }
}

function readableReadinessReason(reason: string) {
  const { source, detail } = splitReasonSource(reason)
  const fieldEmpty = detail.match(/^campo\s+"([^"]+)"\s+vazio$/i)
  const quotedEmpty = detail.match(/^"([^"]+)"\s+sem valor$/i)
  const placeholder = detail.match(/ainda contém placeholder/i)

  let message = detail
    .replace(/^campo\s+/i, "")
    .replace(/\s+vazio$/i, " sem preencher")
    .replace(/\s+sem valor$/i, " sem preencher")
    .replace(/placeholder/i, "texto temporário")

  if (fieldEmpty) {
    message = `${fieldEmpty[1]} sem preencher`
  } else if (quotedEmpty) {
    message = `${quotedEmpty[1]} sem preencher`
  } else if (placeholder) {
    message = "texto temporário ainda aparece"
  }

  return source ? `${source}: ${message}` : message
}

function AgentCard({ agent }: { agent: AgentReadiness }) {
  const b = statusBadge(agent.status)
  const readableOkSources = agent.reads_ok?.map(readableSource) ?? []
  return (
    <article className="border-border/40 bg-card rounded-lg border p-4">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-foreground/90 text-sm font-semibold">
            {agent.name}
          </h3>
          <p className="text-muted-foreground text-xs">{agent.role}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}
        >
          {b.icon}
          {b.label}
        </span>
      </header>
      {readableOkSources.length > 0 ? (
        <p className="text-muted-foreground mb-1 text-xs">
          Pronto: {readableOkSources.join(", ")}
        </p>
      ) : null}
      {agent.reasons && agent.reasons.length > 0 ? (
        <ul className="text-foreground/80 mt-2 space-y-0.5 text-xs">
          {agent.reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-muted-foreground">·</span>
              <span>{readableReadinessReason(r)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export function ReadinessPage() {
  const query = useQuery({
    queryKey: ["workspace-readiness"],
    queryFn: getReadiness,
    refetchInterval: 30_000,
  })

  const agents = query.data?.agents ?? []
  const summary = query.data?.summary

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Prontidão dos agentes">
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
        <div className="mb-4">
          <ValidateReadinessCard />
        </div>
        {query.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" /> Carregando...
          </div>
        ) : query.isError ? (
          <div className="text-destructive text-sm">
            {(query.error as Error)?.message || "Erro ao carregar prontidão"}
          </div>
        ) : (
          <div className="space-y-4">
            {summary ? (
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <IconCircleCheck className="size-3.5" /> {summary.ok} pronto
                  {summary.ok === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <IconCircleDot className="size-3.5" /> {summary.partial}{" "}
                  parcial
                  {summary.partial === 1 ? "" : "is"}
                </span>
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                  <IconCircleX className="size-3.5" /> {summary.blocked}{" "}
                  bloqueado{summary.blocked === 1 ? "" : "s"}
                </span>
                <span className="opacity-60">·</span>
                <Link
                  to="/pendencias"
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                >
                  Ver pendências
                  <IconArrowRight className="size-3" />
                </Link>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((a) => (
                <AgentCard key={a.id} agent={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
