import { IconChevronDown } from "@tabler/icons-react"
import { useEffect } from "react"

import type { WhatsAppMessage } from "@/api/whatsapp"
import { useAutoScroll } from "@/hooks/whatsapp/use-auto-scroll"
import type { InternalNote } from "@/lib/whatsapp/internal-notes"

import { InternalNoteBubble } from "./internal-note-bubble"
import { MessageBubble } from "./message-bubble"

export interface MessageListProps {
  messages: WhatsAppMessage[]
  resetKey?: string | null
  pendingIds?: ReadonlySet<number | string>
  empty?: React.ReactNode
  /** Live search query — bubbles highlight matches and the cursor scrolls. */
  searchQuery?: string
  /** Message id at the search cursor; if set, scrolls into view on change. */
  currentMatchId?: number | null
  /** Internal notes (dashboard-only) — intercalated by timestamp. */
  notes?: readonly InternalNote[]
  onReply?: (m: WhatsAppMessage) => void
  onForward?: (m: WhatsAppMessage) => void
  onDeleteLocal?: (m: WhatsAppMessage) => void
  onRemoveNote?: (id: string) => void
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
      <span className="text-foreground/70 text-[10px] font-medium capitalize">
        {label}
      </span>
      <div className="bg-border/50 h-px flex-1" />
    </div>
  )
}

type Item =
  | { kind: "msg"; ts: number; msg: WhatsAppMessage }
  | { kind: "note"; ts: number; note: InternalNote }

function tsMs(ts: number): number {
  return ts < 1e10 ? ts * 1000 : ts
}

function intercalate(
  messages: readonly WhatsAppMessage[],
  notes: readonly InternalNote[],
): Item[] {
  const items: Item[] = [
    ...messages.map<Item>((msg) => ({ kind: "msg", ts: tsMs(msg.ts), msg })),
    ...notes.map<Item>((note) => ({ kind: "note", ts: note.ts, note })),
  ]
  items.sort((a, b) => a.ts - b.ts)
  return items
}

export function MessageList({
  messages,
  resetKey,
  pendingIds,
  empty,
  searchQuery = "",
  currentMatchId = null,
  notes = [],
  onReply,
  onForward,
  onDeleteLocal,
  onRemoveNote,
}: MessageListProps) {
  const items = intercalate(messages, notes)
  const { scrollRef, newMessagesCount, handleScroll, scrollToBottom } =
    useAutoScroll({
      resetKey: resetKey ?? "",
      messageCount: items.length,
    })

  // Whenever the search cursor moves, find the bubble in the DOM and scroll it
  // into view. Querying by data attribute keeps this decoupled from React refs.
  useEffect(() => {
    if (currentMatchId == null) return
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${currentMatchId}"]`,
    )
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [currentMatchId, scrollRef])

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
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center">{empty}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((item, i) => {
              const prev = items[i - 1]
              const showDateSep =
                i === 0 ||
                (prev &&
                  new Date(prev.ts).toDateString() !==
                    new Date(item.ts).toDateString())
              const sepTs =
                item.kind === "msg" ? item.msg.ts : Math.floor(item.ts / 1000)
              if (item.kind === "note") {
                return (
                  <div key={`note-${item.note.id}`}>
                    {showDateSep && <DateSeparator ts={sepTs} />}
                    <InternalNoteBubble
                      note={item.note}
                      onRemove={onRemoveNote}
                    />
                  </div>
                )
              }
              return (
                <div key={`msg-${item.msg.id}`}>
                  {showDateSep && <DateSeparator ts={sepTs} />}
                  <MessageBubble
                    message={item.msg}
                    pendingIds={pendingIds}
                    searchQuery={searchQuery}
                    isCurrentMatch={item.msg.id === currentMatchId}
                    onReply={onReply}
                    onForward={onForward}
                    onDeleteLocal={onDeleteLocal}
                  />
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
