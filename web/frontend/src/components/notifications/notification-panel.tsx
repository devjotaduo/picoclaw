/**
 * NotificationPanel — rodapé do sidebar com notificações curtas que os
 * agentes (Rafael, Sofia, Lia, Marcos, Camila, Pixel/Doc/Dev) dispararam
 * pro operador via tool `notify_user`.
 *
 * Refined-minimalism:
 *  - Sem ícones categóricos coloridos (kind=data/warning/billing fica
 *    implícito no body; importa o conteúdo, não o tipo).
 *  - Hairlines entre items, sem cards-com-sombra.
 *  - Único acento: dot âmbar pequeno na lateral pra não-lida.
 *  - Tipografia hierárquica via peso + opacidade (sem cores extras).
 *  - Chevron único pra toggle, sem badge bg colorido (só número).
 */
import { IconChevronDown, IconChevronRight, IconX } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"

import { type Notification } from "@/api/notifications"
import { useNotifications } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils"

function formatRelativeTime(iso: string): string {
  const created = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - created) / 1000))
  if (diffSec < 60) return "agora"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

export function NotificationPanel() {
  const { notifications, unreadCount, markRead, markAllRead, dismiss } =
    useNotifications()
  const [open, setOpen] = useState(unreadCount > 0)
  const previousUnreadCountRef = useRef(unreadCount)

  useEffect(() => {
    const previousUnreadCount = previousUnreadCountRef.current
    if (previousUnreadCount === 0 && unreadCount > 0) {
      setOpen(true)
    }
    previousUnreadCountRef.current = unreadCount
  }, [unreadCount])

  return (
    <div
      className="border-sidebar-border/40 mt-auto border-t group-data-[collapsible=icon]:hidden"
      data-testid="notification-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sidebar-foreground/60 hover:text-sidebar-foreground flex w-full items-center gap-2 px-3 py-2.5 text-[12px] transition-colors"
        aria-expanded={open}
        aria-controls="notification-list"
      >
        {open ? (
          <IconChevronDown className="size-3 opacity-60" />
        ) : (
          <IconChevronRight className="size-3 opacity-60" />
        )}
        <span className="font-medium tracking-tight">Notificações</span>
        {unreadCount > 0 && (
          <span className="text-foreground ml-auto text-[11px] font-semibold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-list"
          className="border-sidebar-border/30 border-t"
        >
          {notifications.length === 0 ? (
            <div className="text-sidebar-foreground/40 px-3 py-5 text-center text-[11px]">
              Nada por aqui.
            </div>
          ) : (
            <>
              <ul className="max-h-72 overflow-y-auto">
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
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="border-sidebar-border/30 text-sidebar-foreground/50 hover:text-sidebar-foreground block w-full border-t px-3 py-2 text-left text-[11px] transition-colors"
                >
                  Marcar todas como lidas
                </button>
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
  const isUnread = n.read_at == null

  return (
    <li
      className={cn(
        "group/notification border-sidebar-border/20 hover:bg-sidebar-accent/30 relative cursor-pointer border-b px-3 py-2.5 transition-colors last:border-b-0",
        isUnread && "bg-sidebar-accent/15",
      )}
      onClick={() => {
        if (isUnread) onClick()
      }}
    >
      <div className="flex items-start gap-2">
        {/* Indicador minimal: dot âmbar pra não-lida, espaço vazio pra lida */}
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            isUnread ? "bg-amber-500" : "bg-transparent",
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-[12.5px] leading-snug",
                isUnread
                  ? "text-sidebar-foreground font-medium"
                  : "text-sidebar-foreground/80",
              )}
            >
              {n.title}
            </span>
            <span className="text-sidebar-foreground/40 shrink-0 text-[10px] tabular-nums">
              {formatRelativeTime(n.created_at)}
            </span>
          </div>
          {n.body && (
            <p className="text-sidebar-foreground/55 mt-0.5 line-clamp-2 text-[11px] leading-snug">
              {n.body}
            </p>
          )}
          {(n.cta_url || n.agent_id) && (
            <div className="text-sidebar-foreground/40 mt-1 flex items-center justify-between gap-2 text-[10px]">
              {n.cta_url ? (
                <a
                  href={n.cta_url}
                  // Internal deep-links (e.g. /agent/proposals from an
                  // approval notification) open in the same tab; only external
                  // URLs get a new tab.
                  {...(n.cta_url.startsWith("/")
                    ? {}
                    : { target: "_blank", rel: "noreferrer" })}
                  onClick={(e) => {
                    if (isUnread) onClick()
                    e.stopPropagation()
                  }}
                  className="text-sidebar-foreground/70 decoration-sidebar-foreground/20 hover:decoration-sidebar-foreground/60 underline decoration-1 underline-offset-2"
                >
                  {n.cta_label ?? "abrir"}
                </a>
              ) : (
                <span />
              )}
              {n.agent_id && <span>via {n.agent_id}</span>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="text-sidebar-foreground/30 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground invisible -mt-0.5 -mr-0.5 shrink-0 rounded p-0.5 transition-colors group-hover/notification:visible"
          aria-label="Dispensar"
        >
          <IconX className="size-3" />
        </button>
      </div>
    </li>
  )
}
