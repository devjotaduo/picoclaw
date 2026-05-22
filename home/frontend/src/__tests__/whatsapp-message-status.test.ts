import { describe, expect, it } from "vitest"

import type { WhatsAppMessage } from "@/api/whatsapp"
import {
  deriveMessageStatus,
  isStatusAtLeast,
} from "@/lib/whatsapp/message-status"

function msg(overrides: Partial<WhatsAppMessage> = {}): WhatsAppMessage {
  return {
    id: 1,
    chat_jid: "5511999999999@s.whatsapp.net",
    direction: "out",
    source: "human",
    content: "hi",
    ts: Math.floor(Date.now() / 1000),
    delivered: false,
    ...overrides,
  }
}

describe("deriveMessageStatus", () => {
  it("returns null for inbound messages", () => {
    expect(
      deriveMessageStatus({ message: msg({ direction: "in" }) }),
    ).toBeNull()
  })

  it("returns 'pending' when message id is in the optimistic set", () => {
    expect(
      deriveMessageStatus({
        message: msg({ delivered: false }),
        optimisticIds: new Set([99]),
        optimisticKey: 99,
      }),
    ).toBe("pending")
  })

  it("uses explicit backend status when present", () => {
    expect(deriveMessageStatus({ message: msg({ status: "read" }) })).toBe(
      "read",
    )
  })

  it("maps read_at > 0 to 'read'", () => {
    expect(
      deriveMessageStatus({ message: msg({ read_at: 1_700_000_000 }) }),
    ).toBe("read")
  })

  it("maps delivered=true (without read_at) to 'delivered'", () => {
    expect(deriveMessageStatus({ message: msg({ delivered: true }) })).toBe(
      "delivered",
    )
  })

  it("falls back to 'sent' for old undelivered messages", () => {
    const oldTs = Math.floor((Date.now() - 5 * 60_000) / 1000)
    expect(
      deriveMessageStatus({ message: msg({ ts: oldTs }), now: Date.now() }),
    ).toBe("sent")
  })

  it("treats messages with errors as 'sent' (never advances past)", () => {
    expect(
      deriveMessageStatus({ message: msg({ error: "boom", delivered: true }) }),
    ).toBe("sent")
  })

  it("supports ts in seconds OR milliseconds transparently", () => {
    const tsSec = Math.floor(Date.now() / 1000)
    const tsMs = Date.now()
    expect(deriveMessageStatus({ message: msg({ ts: tsSec }) })).toBe("sent")
    expect(deriveMessageStatus({ message: msg({ ts: tsMs }) })).toBe("sent")
  })
})

describe("isStatusAtLeast", () => {
  it("returns false for nullish current", () => {
    expect(isStatusAtLeast(null, "sent")).toBe(false)
    expect(isStatusAtLeast(undefined, "sent")).toBe(false)
  })

  it("uses ordinal ordering pending < sent < delivered < read", () => {
    expect(isStatusAtLeast("pending", "sent")).toBe(false)
    expect(isStatusAtLeast("sent", "sent")).toBe(true)
    expect(isStatusAtLeast("delivered", "sent")).toBe(true)
    expect(isStatusAtLeast("read", "delivered")).toBe(true)
    expect(isStatusAtLeast("delivered", "read")).toBe(false)
  })
})
