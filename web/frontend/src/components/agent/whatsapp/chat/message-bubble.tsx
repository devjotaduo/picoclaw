import { IconExternalLink } from "@tabler/icons-react"
import { useMemo } from "react"

import type { WhatsAppMessage, WhatsAppMessageStatus } from "@/api/whatsapp"
import { deriveMessageStatus } from "@/lib/whatsapp/message-status"

import { MessageStatus } from "./message-status"

export interface MessageBubbleProps {
  message: WhatsAppMessage
  /** Set of message IDs that are still pending server confirmation. */
  pendingIds?: ReadonlySet<number | string>
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|webp|avif|svg)(\?[^\s]*)?$/i

function renderContent(text: string): React.ReactNode {
  if (!text) return null
  const parts: React.ReactNode[] = []
  const re = new RegExp(URL_REGEX.source, "gi")
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const url = match[0]!
    if (IMAGE_EXT_REGEX.test(url)) {
      parts.push(
        <a
          key={`${match.index}-img`}
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
      parts.push(
        <a
          key={`${match.index}-url`}
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
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function formatClock(ts: number): string {
  if (!ts) return ""
  const d = new Date(ts < 1e10 ? ts * 1000 : ts)
  const h = d.getHours().toString().padStart(2, "0")
  const m = d.getMinutes().toString().padStart(2, "0")
  return `${h}:${m}`
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

/**
 * Single chat bubble. Direction-based alignment & color (no AGENTE/VOCÊ
 * labels — that distinction is conveyed visually and through the tooltip
 * on the timestamp).
 */
export function MessageBubble({ message, pendingIds }: MessageBubbleProps) {
  const isOut = message.direction === "out"
  const isHuman = message.source === "human"

  const status: WhatsAppMessageStatus | null = useMemo(
    () =>
      deriveMessageStatus({
        message,
        optimisticIds: pendingIds,
        optimisticKey: message.id,
      }),
    [message, pendingIds],
  )

  const bubbleClass = isOut
    ? isHuman
      ? "bg-sky-500/15 ring-1 ring-sky-300/30 dark:ring-sky-700/30 text-foreground"
      : "bg-[#d9fdd3] text-gray-900 dark:bg-emerald-950/60 dark:text-emerald-50 ring-1 ring-emerald-200/60 dark:ring-emerald-800/40"
    : "bg-card ring-1 ring-border/60 text-foreground"

  const senderTooltip = isOut
    ? isHuman
      ? "Enviado manualmente pelo operador"
      : "Enviado pelo agente automático"
    : "Recebido do contato"

  const fullTs = formatFullTimestamp(message.ts)

  return (
    <div
      className={`flex ${isOut ? "justify-end" : "justify-start"}`}
      data-testid="message-bubble"
      data-direction={message.direction}
      data-source={message.source}
      data-status={status ?? "incoming"}
    >
      <div
        className={`flex max-w-[76%] flex-col gap-0.5 ${isOut ? "items-end" : "items-start"}`}
      >
        <div
          className={`${bubbleClass} relative rounded-2xl px-3.5 py-2 shadow-xs ${
            isOut ? "rounded-tr-sm" : "rounded-tl-sm"
          }`}
        >
          <div className="break-words text-sm leading-relaxed whitespace-pre-wrap">
            {renderContent(message.content)}
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
              title={`${senderTooltip} · ${fullTs}`}
              dateTime={new Date(
                message.ts < 1e10 ? message.ts * 1000 : message.ts,
              ).toISOString()}
              className="text-foreground/55 dark:text-foreground/65 text-[10px] tabular-nums"
            >
              {formatClock(message.ts)}
            </time>
            {isOut && (
              <MessageStatus status={status} hasError={!!message.error} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
