/**
 * RightRail — terceira coluna persistente do shell do tenant. Agrega os sinais
 * que os agentes já produzem (notificações, handoffs, leads, pendências) em
 * cards recolhíveis. Inspirado no context-rail do Chatwoot/Intercom + no painel
 * do Claude Code.
 *
 * - Expandido (w-80): cards roláveis.
 * - Recolhido (w-12): tira de ícones com badges de contagem; clicar expande.
 * - Escondido abaixo de `lg` (a sidebar já entrega notificações no mobile).
 * - Estado persistido em localStorage; gated por `layout.right_rail`.
 */
import {
  IconBell,
  IconClipboardList,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconTargetArrow,
  IconUsers,
} from "@tabler/icons-react"
import * as React from "react"

import { HandoffsCard } from "@/components/right-rail/handoffs-card"
import { LeadsCard } from "@/components/right-rail/leads-card"
import { NotificationsCard } from "@/components/right-rail/notifications-card"
import { PendingCard } from "@/components/right-rail/pending-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAgentDashboard } from "@/hooks/use-agent-dashboard"
import { useLeads } from "@/hooks/use-leads"
import { useNotifications } from "@/hooks/use-notifications"
import { useUIVisibility } from "@/hooks/use-ui-visibility"
import { actionableDashboardItems } from "@/lib/agent-dashboard"
import { cn } from "@/lib/utils"

const COLLAPSE_STORAGE_KEY = "picoclaw.right-rail.collapsed"

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function RightRail() {
  const { visible } = useUIVisibility()
  const [collapsed, setCollapsed] = React.useState(readCollapsed)

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0")
      } catch {
        // best-effort
      }
      return next
    })
  }, [])

  if (!visible("layout.right_rail", false)) {
    return null
  }

  if (collapsed) {
    return <CollapsedRail onExpand={toggle} />
  }

  return (
    <aside className="border-border/40 bg-background hidden w-80 shrink-0 flex-col border-l lg:flex">
      <div className="border-border/40 flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
          Painel
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-label="Recolher painel"
          className="text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors"
        >
          <IconLayoutSidebarRightCollapse className="size-4" />
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <NotificationsCard />
        <HandoffsCard />
        <LeadsCard />
        <PendingCard />
      </ScrollArea>
    </aside>
  )
}

function CollapsedRail({ onExpand }: { onExpand: () => void }) {
  const { notifications } = useNotifications()
  const { leads } = useLeads()
  const { items } = useAgentDashboard()

  const unreadNotifs = notifications.filter(
    (n) => n.kind !== "handoff" && n.read_at == null,
  ).length
  const handoffs = notifications.filter((n) => n.kind === "handoff").length
  const pendingHandoffs = notifications.filter(
    (n) => n.kind === "handoff" && n.read_at == null,
  ).length
  const pending = actionableDashboardItems(items).length

  return (
    <aside className="border-border/40 bg-background hidden w-12 shrink-0 flex-col items-center gap-1 border-l py-2 lg:flex">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expandir painel"
        className="text-muted-foreground/60 hover:text-foreground hover:bg-muted mb-1 rounded-md p-1.5 transition-colors"
      >
        <IconLayoutSidebarRightExpand className="size-4" />
      </button>
      <CollapsedIcon
        icon={IconBell}
        label="Notificações"
        count={unreadNotifs}
        highlight={unreadNotifs > 0}
        onClick={onExpand}
      />
      <CollapsedIcon
        icon={IconUsers}
        label="Transferidas p/ humano"
        count={handoffs}
        highlight={pendingHandoffs > 0}
        onClick={onExpand}
      />
      <CollapsedIcon
        icon={IconTargetArrow}
        label="Leads"
        count={leads.length}
        onClick={onExpand}
      />
      <CollapsedIcon
        icon={IconClipboardList}
        label="Pendências"
        count={pending}
        onClick={onExpand}
      />
    </aside>
  )
}

function CollapsedIcon({
  icon: Icon,
  label,
  count,
  highlight,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  highlight?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}${count > 0 ? ` (${count})` : ""}`}
      title={label}
      className="text-muted-foreground/70 hover:text-foreground hover:bg-muted relative rounded-md p-2 transition-colors"
    >
      <Icon className="size-4" />
      {count > 0 ? (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-semibold tabular-nums",
            highlight
              ? "bg-amber-500 text-white"
              : "bg-muted-foreground/30 text-foreground",
          )}
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  )
}
