/**
 * PendingCard — pendências & relatórios acionáveis publicados pelos agentes
 * (Rafael, Lia, QA…) no painel. Reusa useAgentDashboard + helpers de lib.
 */
import { IconClipboardList } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"

import type { AgentDashboardItem } from "@/api/agent-dashboard"
import { RailCard, RailEmpty } from "@/components/right-rail/rail-card"
import { agentInitials, formatRailTime } from "@/components/right-rail/rail-utils"
import { useAgentDashboard } from "@/hooks/use-agent-dashboard"
import {
  actionableDashboardItems,
  dashboardItemStamp,
  dashboardPriorityLabel,
  friendlyAgentName,
  friendlyDashboardText,
  recentDashboardItems,
} from "@/lib/agent-dashboard"
import { cn } from "@/lib/utils"

const PRIORITY_CLASS: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  medium: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
}

export function PendingCard() {
  const { items } = useAgentDashboard()
  const actionable = recentDashboardItems(actionableDashboardItems(items), 12)

  return (
    <RailCard
      icon={IconClipboardList}
      title="Pendências & relatórios"
      count={actionable.length}
    >
      {actionable.length === 0 ? (
        <RailEmpty>Nenhuma pendência agora.</RailEmpty>
      ) : (
        <>
          <ul className="space-y-1 px-1">
            {actionable.map((item) => (
              <PendingRow key={`${item.source}:${item.id}`} item={item} />
            ))}
          </ul>
          <Link
            to="/agent/dashboard"
            className="text-muted-foreground/70 hover:text-foreground mt-1 block px-3 py-1.5 text-[11px] transition-colors"
          >
            Ver painel completo →
          </Link>
        </>
      )}
    </RailCard>
  )
}

function PendingRow({ item }: { item: AgentDashboardItem }) {
  const agentName = friendlyAgentName(item)
  const priorityLabel = dashboardPriorityLabel(item.priority)
  const text = friendlyDashboardText(item.summary || item.title)

  return (
    <li className="hover:bg-muted/40 flex items-start gap-2 rounded-md px-2 py-2 transition-colors">
      <span className="bg-primary/10 text-primary ring-primary/15 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1">
        {agentInitials(agentName)}
      </span>
      <span className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-foreground truncate text-[12px] font-medium">
            {item.title}
          </span>
          <span className="text-muted-foreground/40 shrink-0 text-[10px] tabular-nums">
            {formatRailTime(dashboardItemStamp(item))}
          </span>
        </div>
        {text && text !== item.title ? (
          <p className="text-muted-foreground/70 mt-0.5 line-clamp-1 text-[11px]">
            {text}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          {priorityLabel ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                PRIORITY_CLASS[item.priority ?? "medium"] ??
                  "bg-muted text-muted-foreground",
              )}
            >
              {priorityLabel}
            </span>
          ) : null}
          <span className="text-muted-foreground/50 text-[10px]">
            {agentName}
          </span>
        </div>
      </span>
    </li>
  )
}
