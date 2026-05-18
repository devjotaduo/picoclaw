import type {
  WhatsAppMessage,
  WhatsAppMessageStatus,
} from "@/api/whatsapp"

const PENDING_GRACE_MS = 60_000

export interface DeriveStatusInput {
  message: Pick<WhatsAppMessage, "direction" | "delivered" | "status" | "ts" | "read_at" | "error">
  optimisticIds?: ReadonlySet<number | string>
  optimisticKey?: number | string
  now?: number
}

export function deriveMessageStatus(
  input: DeriveStatusInput,
): WhatsAppMessageStatus | null {
  const { message } = input
  if (message.direction !== "out") return null
  if (message.error) return "sent"
  if (message.status) return message.status
  if (input.optimisticKey != null && input.optimisticIds?.has(input.optimisticKey)) {
    return "pending"
  }
  if (message.read_at && message.read_at > 0) return "read"
  if (message.delivered) return "delivered"
  const now = input.now ?? Date.now()
  const tsMs = message.ts < 1e10 ? message.ts * 1000 : message.ts
  if (now - tsMs < PENDING_GRACE_MS) return "sent"
  return "sent"
}

export const STATUS_ORDER: Record<WhatsAppMessageStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

export function isStatusAtLeast(
  current: WhatsAppMessageStatus | null | undefined,
  target: WhatsAppMessageStatus,
): boolean {
  if (!current) return false
  return STATUS_ORDER[current] >= STATUS_ORDER[target]
}
