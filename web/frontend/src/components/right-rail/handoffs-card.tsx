/**
 * HandoffsCard — conversas transferidas para um humano. Deriva das
 * notificações `kind="handoff"` que o backend emite quando um agente chama
 * request_handoff. Status pill + CTA pro detalhe (cta_url deep-link).
 */
import { IconArrowRight, IconUsers } from "@tabler/icons-react"

import type { Notification } from "@/api/notifications"
import { RailCard, RailEmpty } from "@/components/right-rail/rail-card"
import {
  agentInitials,
  formatRailTime,
} from "@/components/right-rail/rail-utils"
import { useNotifications } from "@/hooks/use-notifications"

export function HandoffsCard() {
  const { notifications, markRead } = useNotifications()
  const handoffs = notifications.filter((n) => n.kind === "handoff")
  const pending = handoffs.filter((n) => n.read_at == null).length

  return (
    <RailCard
      icon={IconUsers}
      title="Transferidas p/ humano"
      count={handoffs.length}
      highlight={pending > 0}
    >
      {handoffs.length === 0 ? (
        <RailEmpty>Nenhuma conversa aguardando um humano.</RailEmpty>
      ) : (
        <ul className="space-y-1 px-1">
          {handoffs.map((n) => (
            <HandoffRow
              key={n.id}
              notification={n}
              onOpen={() => markRead(n)}
            />
          ))}
        </ul>
      )}
    </RailCard>
  )
}

function HandoffRow({
  notification: n,
  onOpen,
}: {
  notification: Notification
  onOpen: () => void
}) {
  const waiting = n.read_at == null
  const initials = agentInitials(n.title)
  const inner = (
    <>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-[12px] font-medium">
          {n.title}
        </span>
        {n.body ? (
          <span className="text-muted-foreground/70 mt-0.5 line-clamp-1 block text-[11px]">
            {n.body}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={
            waiting
              ? "rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400"
              : "bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[9px] font-medium"
          }
        >
          {waiting ? "Aguardando" : "Visto"}
        </span>
        <span className="text-muted-foreground/40 text-[10px] tabular-nums">
          {formatRailTime(n.created_at)}
        </span>
      </span>
    </>
  )

  if (n.cta_url) {
    return (
      <li>
        <a
          href={n.cta_url}
          {...(n.cta_url.startsWith("/")
            ? {}
            : { target: "_blank", rel: "noreferrer" })}
          onClick={onOpen}
          className="hover:bg-muted/40 group/handoff flex items-center gap-2 rounded-md px-2 py-2 transition-colors"
        >
          {inner}
          <IconArrowRight className="text-muted-foreground/40 group-hover/handoff:text-foreground size-3.5 shrink-0 transition-colors" />
        </a>
      </li>
    )
  }

  return (
    <li
      className="hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors"
      onClick={onOpen}
    >
      {inner}
    </li>
  )
}
