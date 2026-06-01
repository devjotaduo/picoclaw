/**
 * NotificationsCard — notificações dos agentes no right rail (exceto handoffs,
 * que têm card próprio). Reusa useNotifications; o card de handoff compartilha
 * o mesmo cache do react-query.
 */
import { IconBell, IconX } from "@tabler/icons-react"

import type { Notification } from "@/api/notifications"
import { RailCard, RailEmpty } from "@/components/right-rail/rail-card"
import { formatRailTime } from "@/components/right-rail/rail-utils"
import { useNotifications } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils"

export function NotificationsCard() {
  const { notifications, markRead, markAllRead, dismiss } = useNotifications()

  const items = notifications.filter((n) => n.kind !== "handoff")
  const unread = items.filter((n) => n.read_at == null).length

  return (
    <RailCard
      icon={IconBell}
      title="Notificações"
      count={unread}
      highlight={unread > 0}
    >
      {items.length === 0 ? (
        <RailEmpty>Nada por aqui.</RailEmpty>
      ) : (
        <ul className="px-1">
          {items.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onRead={() => markRead(n)}
              onDismiss={() => dismiss(n.id)}
            />
          ))}
        </ul>
      )}
      {unread > 0 ? (
        <button
          type="button"
          onClick={() => markAllRead()}
          className="text-muted-foreground/70 hover:text-foreground mt-1 block w-full px-3 py-1.5 text-left text-[11px] transition-colors"
        >
          Marcar todas como lidas
        </button>
      ) : null}
    </RailCard>
  )
}

function NotificationRow({
  notification: n,
  onRead,
  onDismiss,
}: {
  notification: Notification
  onRead: () => void
  onDismiss: () => void
}) {
  const isUnread = n.read_at == null
  return (
    <li
      className={cn(
        "group/notif hover:bg-muted/40 relative cursor-pointer rounded-md px-2 py-2 transition-colors",
        isUnread && "bg-muted/20",
      )}
      onClick={() => {
        if (isUnread) onRead()
      }}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            isUnread ? "bg-amber-500" : "bg-transparent",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-[12px] leading-snug",
                isUnread ? "text-foreground font-medium" : "text-foreground/75",
              )}
            >
              {n.title}
            </span>
            <span className="text-muted-foreground/50 shrink-0 text-[10px] tabular-nums">
              {formatRailTime(n.created_at)}
            </span>
          </div>
          {n.body ? (
            <p className="text-muted-foreground/70 mt-0.5 line-clamp-2 text-[11px] leading-snug">
              {n.body}
            </p>
          ) : null}
          {(n.cta_url || n.agent_id) && (
            <div className="text-muted-foreground/50 mt-1 flex items-center justify-between gap-2 text-[10px]">
              {n.cta_url ? (
                <a
                  href={n.cta_url}
                  {...(n.cta_url.startsWith("/")
                    ? {}
                    : { target: "_blank", rel: "noreferrer" })}
                  onClick={(e) => {
                    if (isUnread) onRead()
                    e.stopPropagation()
                  }}
                  className="text-foreground/70 hover:text-foreground underline decoration-1 underline-offset-2"
                >
                  {n.cta_label ?? "abrir"}
                </a>
              ) : (
                <span />
              )}
              {n.agent_id ? <span>via {n.agent_id}</span> : null}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="text-muted-foreground/30 hover:bg-muted hover:text-foreground invisible -mt-0.5 -mr-0.5 shrink-0 rounded p-0.5 transition-colors group-hover/notif:visible"
          aria-label="Dispensar"
        >
          <IconX className="size-3" />
        </button>
      </div>
    </li>
  )
}
