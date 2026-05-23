/**
 * NotificationPanel — card colapsável no rodapé do sidebar mostrando
 * notificações curtas que os agentes dispararam pro usuário.
 *
 * Tipos:
 *  - data: atualizações de números/métricas (verde)
 *  - warning: algo a olhar (âmbar)
 *  - billing: cobrança/limite (azul)
 *
 * Cada item tem CTA opcional. Clique abre o link. Hover mostra ações
 * (marcar lida / dispensar). Não-lidas têm dot na lateral esquerda e
 * fundo levemente destacado.
 *
 * Sem feature flag adicional aqui — o app-sidebar.tsx só renderiza o
 * painel quando isVisible("sidebar.notifications") for true.
 */

import {
  IconBell,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCreditCard,
  IconTrendingUp,
  IconX,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { useState } from "react"

import { type Notification, type NotificationKind } from "@/api/notifications"
import { Button } from "@/components/ui/button"
import { useNotifications } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils"

const KIND_META: Record<
  NotificationKind,
  {
    icon: typeof IconBell
    accent: string
    accentBg: string
    label: string
  }
> = {
  data: {
    icon: IconTrendingUp,
    accent: "text-emerald-500",
    accentBg: "bg-emerald-500/10",
    label: "Dados",
  },
  warning: {
    icon: IconAlertTriangle,
    accent: "text-amber-500",
    accentBg: "bg-amber-500/10",
    label: "Aviso",
  },
  billing: {
    icon: IconCreditCard,
    accent: "text-sky-500",
    accentBg: "bg-sky-500/10",
    label: "Cobrança",
  },
}

function formatRelativeTime(iso: string): string {
  const created = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - created) / 1000))
  if (diffSec < 60) return "agora"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay} d`
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })
}

export function NotificationPanel() {
  const { notifications, unreadCount, markRead, markAllRead, dismiss } =
    useNotifications()
  // Default: aberto se tem não-lidas; fechado se tudo lido / vazio.
  const [open, setOpen] = useState(unreadCount > 0)

  return (
    <div
      className={cn(
        "mt-auto rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 transition-colors",
        "group-data-[collapsible=icon]:hidden",
      )}
      data-testid="notification-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-t-lg px-3 py-2.5 text-left text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
        aria-expanded={open}
        aria-controls="notification-list"
      >
        <span className="flex items-center gap-2">
          <IconBell className="size-3.5" />
          Notificações
          {unreadCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
        {open ? (
          <IconChevronDown className="size-3.5 opacity-60" />
        ) : (
          <IconChevronUp className="size-3.5 opacity-60" />
        )}
      </button>

      {open && (
        <div id="notification-list" className="border-t border-sidebar-border/40">
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-sidebar-foreground/50">
              Nenhuma notificação por enquanto.
            </div>
          ) : (
            <>
              <ul className="max-h-72 overflow-y-auto px-1.5 py-1.5">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClick={() => markRead(n)}
                    onDismiss={() => dismiss(n.id)}
                  />
                ))}
              </ul>
              {unreadCount > 0 && (
                <div className="border-t border-sidebar-border/40 px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full justify-center text-[11px] text-sidebar-foreground/70"
                    onClick={() => markAllRead()}
                  >
                    <IconCheck className="size-3" />
                    Marcar todas como lidas
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationItem({
  notification: n,
  onClick,
  onDismiss,
}: {
  notification: Notification
  onClick: () => void
  onDismiss: () => void
}) {
  const meta = KIND_META[n.kind] ?? KIND_META.data
  const Icon = meta.icon
  const isUnread = n.read_at == null

  const handleCtaClick = (e: React.MouseEvent) => {
    // Marca como lida ao clicar no CTA. Não previne o link de abrir.
    if (isUnread) onClick()
    e.stopPropagation()
  }

  return (
    <li
      className={cn(
        "group/notification relative rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent/60",
        isUnread && "bg-sidebar-accent/30",
      )}
      onClick={() => {
        if (isUnread) onClick()
      }}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
            meta.accentBg,
          )}
        >
          <Icon className={cn("size-3.5", meta.accent)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-sidebar-foreground">
              {n.title}
            </span>
            <span className="shrink-0 text-[10px] text-sidebar-foreground/50">
              {formatRelativeTime(n.created_at)}
            </span>
          </div>
          {n.body && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-sidebar-foreground/70">
              {n.body}
            </p>
          )}
          {(n.cta_url || n.agent_id) && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              {n.cta_url ? (
                <a
                  href={n.cta_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleCtaClick}
                  className={cn(
                    "text-[10px] font-medium hover:underline",
                    meta.accent,
                  )}
                >
                  {n.cta_label ?? "Abrir"} →
                </a>
              ) : (
                <span />
              )}
              {n.agent_id && (
                <span className="text-[10px] text-sidebar-foreground/40">
                  via {n.agent_id}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Unread dot + dismiss button (hover) */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          {isUnread && (
            <span className="mt-1 size-1.5 rounded-full bg-brand-500" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDismiss()
            }}
            className="invisible mt-1 rounded p-0.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground group-hover/notification:visible"
            aria-label="Dispensar"
          >
            <IconX className="size-3" />
          </button>
        </div>
      </div>
    </li>
  )
}
