import type { WhatsAppChat } from "@/api/whatsapp"

export type SLALevel = "ok" | "warning" | "breach"

export interface SLAStatus {
  /** Minutes since the last inbound message we still have not replied to. */
  waitingMinutes: number
  level: SLALevel
  /** Human-friendly short label ("12min", "2h"). */
  label: string
}

const WARNING_AFTER_MIN = 15
const BREACH_AFTER_MIN = 60

export interface SLAInput {
  chat: Pick<WhatsAppChat, "last_message_ts" | "last_direction" | "unread_count">
  now: number
}

/**
 * SLA model: we consider a chat "waiting" when the last message in the
 * thread came FROM the contact and is still unread (i.e., the operator
 * hasn't opened the chat yet). The clock runs from `last_message_ts`.
 *
 * Returns `null` when the chat is not in a waiting state (no SLA to show).
 */
export function computeSLA(input: SLAInput): SLAStatus | null {
  const { chat, now } = input
  if (chat.last_direction !== "in") return null
  if (chat.unread_count <= 0) return null
  if (!chat.last_message_ts) return null
  const lastMs =
    chat.last_message_ts < 1e10 ? chat.last_message_ts * 1000 : chat.last_message_ts
  const diffMin = Math.max(0, Math.floor((now - lastMs) / 60_000))
  return {
    waitingMinutes: diffMin,
    level:
      diffMin >= BREACH_AFTER_MIN
        ? "breach"
        : diffMin >= WARNING_AFTER_MIN
          ? "warning"
          : "ok",
    label: formatDuration(diffMin),
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) {
    return rest === 0 ? `${hours}h` : `${hours}h${rest.toString().padStart(2, "0")}`
  }
  const days = Math.floor(hours / 24)
  return `${days}d`
}
