import { IconChevronDown } from "@tabler/icons-react"

import type { WhatsAppMessage } from "@/api/whatsapp"
import { useAutoScroll } from "@/hooks/whatsapp/use-auto-scroll"

import { MessageBubble } from "./message-bubble"

export interface MessageListProps {
  messages: WhatsAppMessage[]
  /** Key whose change resets autoscroll (typically the chat JID). */
  resetKey?: string | null
  /** Set of message IDs still waiting on server confirmation. */
  pendingIds?: ReadonlySet<number | string>
  /** Rendered when `messages` is empty. */
  empty?: React.ReactNode
}

function toDate(ts: number): Date {
  return new Date(ts < 1e10 ? ts * 1000 : ts)
}

function DateSeparator({ ts }: { ts: number }) {
  const label = toDate(ts).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  return (
    <div className="flex items-center gap-3 py-3" role="separator">
      <div className="bg-border/50 h-px flex-1" />
      <span className="text-foreground/55 text-[10px] font-medium capitalize">
        {label}
      </span>
      <div className="bg-border/50 h-px flex-1" />
    </div>
  )
}

/**
 * Scrollable list of messages with:
 *  - day separators (Portuguese long form)
 *  - smart autoscroll (sticks to bottom unless the user scrolled up)
 *  - "↓ N novas mensagens" pill when the user is reading older messages
 *  - aria-live="polite" so screen readers announce new bubbles
 */
export function MessageList({
  messages,
  resetKey,
  pendingIds,
  empty,
}: MessageListProps) {
  const { scrollRef, newMessagesCount, handleScroll, scrollToBottom } =
    useAutoScroll({
      resetKey: resetKey ?? "",
      messageCount: messages.length,
    })

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="bg-muted/5 absolute inset-0 overflow-y-auto overscroll-contain px-4 py-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Mensagens da conversa"
        data-testid="message-list-scroll"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">{empty}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((msg, i) => {
              const prev = messages[i - 1]
              const showDateSep =
                i === 0 ||
                (prev &&
                  toDate(msg.ts).toDateString() !== toDate(prev.ts).toDateString())
              return (
                <div key={msg.id}>
                  {showDateSep && <DateSeparator ts={msg.ts} />}
                  <MessageBubble message={msg} pendingIds={pendingIds} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {newMessagesCount > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="bg-background text-foreground ring-border/60 hover:bg-muted focus-visible:ring-ring absolute right-4 bottom-4 z-10 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-md ring-1 transition-all focus-visible:ring-2 focus-visible:outline-none"
          aria-label={`Ir para o final, ${newMessagesCount} nova${newMessagesCount === 1 ? "" : "s"} mensage${newMessagesCount === 1 ? "m" : "ns"}`}
        >
          <IconChevronDown className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">
            {newMessagesCount === 1
              ? "1 nova mensagem"
              : `${newMessagesCount} novas mensagens`}
          </span>
        </button>
      )}
    </div>
  )
}
