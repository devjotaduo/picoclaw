import { IconCornerDownLeft, IconDotsVertical, IconExternalLink } from "@tabler/icons-react"
import { useMemo, useState } from "react"

import type { WhatsAppMessage, WhatsAppMessageStatus } from "@/api/whatsapp"
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { deriveMessageStatus } from "@/lib/whatsapp/message-status"
import { parseQuotedContent } from "@/lib/whatsapp/quote"
import { splitByMatches } from "@/lib/whatsapp/search-highlight"

import { MessageContextMenu } from "./message-context-menu"
import { MessageStatus } from "./message-status"

export interface MessageBubbleProps {
  message: WhatsAppMessage
  pendingIds?: ReadonlySet<number | string>
  /** Search query for inline highlight (empty disables highlighting). */
  searchQuery?: string
  /** True when this bubble is the current search-cursor target. */
  isCurrentMatch?: boolean
  /** Optional operator/agent name to enrich the audit tooltip. */
  authorName?: string
  onReply?: (message: WhatsAppMessage) => void
  onForward?: (message: WhatsAppMessage) => void
  onDeleteLocal?: (message: WhatsAppMessage) => void
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|webp|avif|svg)(\?[^\s]*)?$/i

interface InlineSegment {
  text: string
  match: boolean
}

function renderInline(
  text: string,
  searchQuery: string,
): React.ReactNode {
  const segments: InlineSegment[] = searchQuery
    ? splitByMatches(text, searchQuery)
    : [{ text, match: false }]
  const out: React.ReactNode[] = []
  segments.forEach((seg, segIdx) => {
    const reUrl = new RegExp(URL_REGEX.source, "gi")
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = reUrl.exec(seg.text)) !== null) {
      if (m.index > lastIndex) {
        out.push(
          renderTextNode(seg.text.slice(lastIndex, m.index), seg.match, `${segIdx}-${lastIndex}`),
        )
      }
      const url = m[0]!
      if (IMAGE_EXT_REGEX.test(url)) {
        out.push(
          <a
            key={`${segIdx}-img-${m.index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 block focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
            aria-label="Abrir imagem"
          >
            <img
              src={url}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="max-h-52 max-w-full rounded-xl border border-black/10 object-contain"
            />
          </a>,
        )
      } else {
        out.push(
          <a
            key={`${segIdx}-a-${m.index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 break-all underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            {url.length > 60 ? `${url.slice(0, 60)}…` : url}
            <IconExternalLink className="ml-0.5 size-2.5 shrink-0" />
          </a>,
        )
      }
      lastIndex = m.index + url.length
    }
    if (lastIndex < seg.text.length) {
      out.push(
        renderTextNode(seg.text.slice(lastIndex), seg.match, `${segIdx}-end`),
      )
    }
  })
  return out
}

function renderTextNode(text: string, isMatch: boolean, key: string) {
  if (!isMatch) return <span key={key}>{text}</span>
  return (
    <mark
      key={key}
      className="bg-amber-300/70 px-0.5 text-inherit dark:bg-amber-500/40"
    >
      {text}
    </mark>
  )
}

function formatClock(ts: number): string {
  if (!ts) return ""
  const d = new Date(ts < 1e10 ? ts * 1000 : ts)
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}

function formatFullTimestamp(ts: number): string {
  if (!ts) return ""
  const d = new Date(ts < 1e10 ? ts * 1000 : ts)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function MessageBubble({
  message,
  pendingIds,
  searchQuery = "",
  isCurrentMatch = false,
  authorName,
  onReply,
  onForward,
  onDeleteLocal,
}: MessageBubbleProps) {
  const isOut = message.direction === "out"
  const isHuman = message.source === "human"
  const isAgent = message.source === "agent"
  const [menuOpen, setMenuOpen] = useState(false)

  const status: WhatsAppMessageStatus | null = useMemo(
    () =>
      deriveMessageStatus({
        message,
        optimisticIds: pendingIds,
        optimisticKey: message.id,
      }),
    [message, pendingIds],
  )

  const quoted = useMemo(() => parseQuotedContent(message.content), [message.content])
  const bodyText = quoted?.body ?? message.content

  const bubbleClass = isOut
    ? isHuman
      ? "bg-wa-bubble-out-human ring-1 ring-sky-300/40 dark:ring-sky-700/40 text-foreground"
      : "bg-wa-bubble-out text-wa-bubble-out-fg ring-1 ring-emerald-200/60 dark:ring-emerald-800/40"
    : "bg-wa-bubble-in ring-1 ring-border/60 text-foreground"

  const senderTooltip = isOut
    ? isHuman
      ? `Enviado por: ${authorName ?? "Operador"} (manual)`
      : isAgent
        ? `Enviado por: ${authorName ?? "Agente"} (auto)`
        : `Enviado por: ${authorName ?? "Sistema"}`
    : `Recebido de: ${authorName ?? "Contato"}`

  return (
    <div
      className={`group flex ${isOut ? "justify-end" : "justify-start"} ${
        isCurrentMatch ? "scroll-mt-12" : ""
      }`}
      data-testid="message-bubble"
      data-direction={message.direction}
      data-source={message.source}
      data-status={status ?? "incoming"}
      data-message-id={message.id}
    >
      <div
        className={`flex max-w-[76%] flex-col gap-0.5 ${isOut ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-1">
          {/* Context menu trigger (mirror order so it's on the inside edge). */}
          {isOut && (onReply || onForward || onDeleteLocal) && (
            <ContextTrigger
              message={message}
              status={status}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onReply={() => onReply?.(message)}
              onForward={onForward}
              onDeleteLocal={onDeleteLocal}
            />
          )}
          <div
            className={`${bubbleClass} relative rounded-2xl px-3.5 py-2 shadow-xs ${
              isOut ? "rounded-tr-sm" : "rounded-tl-sm"
            } ${
              isCurrentMatch
                ? "ring-2 ring-amber-400 dark:ring-amber-500"
                : ""
            }`}
          >
            {quoted && (
              <div
                className={`mb-1 border-l-2 ${
                  isOut
                    ? "border-emerald-600/60 dark:border-emerald-400/70"
                    : "border-sky-500/60 dark:border-sky-400/70"
                } bg-black/5 dark:bg-white/5 -mx-1 rounded px-2 py-1`}
              >
                <p className="text-foreground/70 text-[10px] font-semibold uppercase">
                  <IconCornerDownLeft
                    className="mb-px mr-0.5 inline size-2.5"
                    aria-hidden="true"
                  />
                  Em resposta
                </p>
                <p className="text-foreground/80 line-clamp-2 text-xs">
                  {quoted.preview}
                </p>
              </div>
            )}
            <div className="break-words text-sm leading-relaxed whitespace-pre-wrap">
              {renderInline(bodyText, searchQuery)}
            </div>
            {message.error && (
              <p className="text-destructive mt-1 text-[10px]">
                Falha: {message.error}
              </p>
            )}
            <div
              className={`mt-1 flex items-center gap-1 ${isOut ? "justify-end" : "justify-start"}`}
            >
              <time
                title={`${senderTooltip} · ${formatFullTimestamp(message.ts)}`}
                dateTime={new Date(
                  message.ts < 1e10 ? message.ts * 1000 : message.ts,
                ).toISOString()}
                className="text-foreground/70 text-[11px] tabular-nums"
              >
                {formatClock(message.ts)}
              </time>
              {isOut && (
                <MessageStatus status={status} hasError={!!message.error} />
              )}
            </div>
          </div>
          {!isOut && (onReply || onForward || onDeleteLocal) && (
            <ContextTrigger
              message={message}
              status={status}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onReply={() => onReply?.(message)}
              onForward={onForward}
              onDeleteLocal={onDeleteLocal}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ContextTrigger({
  message,
  status,
  open,
  onOpenChange,
  onReply,
  onForward,
  onDeleteLocal,
}: {
  message: WhatsAppMessage
  status: WhatsAppMessageStatus | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onReply: () => void
  onForward?: (m: WhatsAppMessage) => void
  onDeleteLocal?: (m: WhatsAppMessage) => void
}) {
  return (
    <MessageContextMenu
      message={message}
      status={status}
      open={open}
      onOpenChange={onOpenChange}
      onReply={onReply}
      onForward={onForward}
      onDeleteLocal={onDeleteLocal}
      trigger={
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="text-foreground/40 hover:text-foreground hover:bg-muted focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none data-[state=open]:opacity-100"
            aria-label="Ações da mensagem"
          >
            <IconDotsVertical className="size-3.5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      }
    />
  )
}
