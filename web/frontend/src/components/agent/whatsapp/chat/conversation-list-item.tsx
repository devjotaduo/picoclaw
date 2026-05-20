import {
  IconCheckbox,
  IconChecks,
  IconCircleOff,
  IconCircleX,
  IconMail,
  IconMailOpened,
  IconPin,
} from "@tabler/icons-react"
import { useState } from "react"

import type { WhatsAppChat } from "@/api/whatsapp"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

import { ContactAvatar } from "./contact-avatar"

function formatJID(jid: string): string {
  const [user] = jid.split("@")
  if (!user) return jid
  return /^\d+$/.test(user) ? `+${user}` : user
}

function formatRelativeTS(ts: number): string {
  if (!ts) return ""
  const d = new Date(ts < 1e10 ? ts * 1000 : ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" })
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="bg-wa-brand flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums shadow-sm"
      aria-label={`${count} mensagens não lidas`}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

function PausedPill() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-700"
      aria-label="Agente pausado para esta conversa"
    >
      <IconCircleOff className="size-2.5" aria-hidden="true" />
      Pausado
    </span>
  )
}

export interface ConversationListItemProps {
  chat: WhatsAppChat
  selected: boolean
  onSelect: () => void
  /** Toggle the read/unread state. The page handles the API call (or local-only). */
  onToggleRead?: (chat: WhatsAppChat) => void
  /** Toggle pause from the list context menu. */
  onTogglePause?: (chat: WhatsAppChat) => void
}

export function ConversationListItem({
  chat,
  selected,
  onSelect,
  onToggleRead,
  onTogglePause,
}: ConversationListItemProps) {
  const displayName = chat.display_name || chat.push_name || formatJID(chat.jid)
  const hasUnread = chat.unread_count > 0 && !selected
  const ts = formatRelativeTS(chat.last_message_ts)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div role="listitem">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <button
          type="button"
          onClick={onSelect}
          onContextMenu={(e) => {
            if (!onToggleRead && !onTogglePause) return
            e.preventDefault()
            setMenuOpen(true)
          }}
          aria-selected={selected}
          aria-current={selected ? "true" : undefined}
          aria-haspopup={onToggleRead || onTogglePause ? "menu" : undefined}
          className={`group focus-visible:ring-ring relative flex w-full items-center gap-3 px-3 py-3 text-left transition-all duration-100 focus-visible:ring-2 focus-visible:outline-none ${
            selected ? "bg-primary/8" : "hover:bg-muted/50"
          }`}
        >
          {selected && (
            <span
              className="bg-primary absolute top-1/2 left-0 h-8 w-[3px] -translate-y-1/2 rounded-r-full"
              aria-hidden="true"
            />
          )}

          <ContactAvatar name={displayName} url={chat.avatar_url} size="md" />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`truncate text-sm leading-snug ${
                  hasUnread
                    ? "text-foreground font-semibold"
                    : selected
                      ? "text-foreground font-medium"
                      : "text-foreground/85 group-hover:text-foreground font-medium"
                }`}
              >
                {displayName}
              </span>
              <span
                className={`shrink-0 text-[11px] tabular-nums ${
                  hasUnread
                    ? "text-wa-brand font-semibold"
                    : "text-foreground/70"
                }`}
              >
                {ts}
              </span>
            </div>

            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {chat.last_direction === "out" && (
                  <IconChecks
                    className="text-muted-foreground size-3 shrink-0 opacity-60"
                    aria-hidden="true"
                  />
                )}
                <p
                  className={`truncate text-xs leading-snug ${
                    hasUnread ? "text-foreground/80" : "text-foreground/60"
                  }`}
                >
                  {chat.last_preview || "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {chat.paused && <PausedPill />}
                {hasUnread && <UnreadBadge count={chat.unread_count} />}
              </div>
            </div>
          </div>
        </button>

        {(onToggleRead || onTogglePause) && (
          <DropdownMenuContent align="start" className="w-52">
            {onToggleRead && (
              <DropdownMenuItem
                onSelect={() => {
                  setMenuOpen(false)
                  onToggleRead(chat)
                }}
              >
                {chat.unread_count > 0 ? (
                  <>
                    <IconMailOpened
                      className="mr-2 size-3.5"
                      aria-hidden="true"
                    />
                    Marcar como lida
                  </>
                ) : (
                  <>
                    <IconMail className="mr-2 size-3.5" aria-hidden="true" />
                    Marcar como não lida
                  </>
                )}
              </DropdownMenuItem>
            )}
            {onTogglePause && (
              <DropdownMenuItem
                onSelect={() => {
                  setMenuOpen(false)
                  onTogglePause(chat)
                }}
              >
                {chat.paused ? (
                  <>
                    <IconCheckbox
                      className="mr-2 size-3.5"
                      aria-hidden="true"
                    />
                    Reativar agente
                  </>
                ) : (
                  <>
                    <IconCircleX className="mr-2 size-3.5" aria-hidden="true" />
                    Pausar agente
                  </>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <IconPin className="mr-2 size-3.5" aria-hidden="true" />
              Fixar (em breve)
            </DropdownMenuItem>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </div>
  )
}
