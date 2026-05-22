import { describe, expect, it } from "vitest"

import type { WhatsAppChat } from "@/api/whatsapp"
import { computeSLA, formatDuration } from "@/lib/whatsapp/sla"

function chat(overrides: Partial<WhatsAppChat>): WhatsAppChat {
  return {
    jid: "x@s.whatsapp.net",
    last_message_ts: 0,
    paused: false,
    unread_count: 0,
    updated_at: 0,
    ...overrides,
  }
}

const NOW = Date.UTC(2026, 4, 18, 12, 0, 0)

describe("computeSLA", () => {
  it("returns null when the last direction was outbound (we already replied)", () => {
    expect(
      computeSLA({
        chat: chat({
          last_direction: "out",
          unread_count: 0,
          last_message_ts: NOW - 60_000,
        }),
        now: NOW,
      }),
    ).toBeNull()
  })

  it("returns null when there's no unread (chat already opened)", () => {
    expect(
      computeSLA({
        chat: chat({
          last_direction: "in",
          unread_count: 0,
          last_message_ts: NOW - 60_000,
        }),
        now: NOW,
      }),
    ).toBeNull()
  })

  it("classifies fresh waits as 'ok'", () => {
    const sla = computeSLA({
      chat: chat({
        last_direction: "in",
        unread_count: 1,
        last_message_ts: NOW - 5 * 60_000,
      }),
      now: NOW,
    })
    expect(sla?.level).toBe("ok")
    expect(sla?.waitingMinutes).toBe(5)
    expect(sla?.label).toBe("5min")
  })

  it("escalates to 'warning' after 15 min", () => {
    const sla = computeSLA({
      chat: chat({
        last_direction: "in",
        unread_count: 1,
        last_message_ts: NOW - 30 * 60_000,
      }),
      now: NOW,
    })
    expect(sla?.level).toBe("warning")
  })

  it("escalates to 'breach' after 60 min", () => {
    const sla = computeSLA({
      chat: chat({
        last_direction: "in",
        unread_count: 1,
        last_message_ts: NOW - 90 * 60_000,
      }),
      now: NOW,
    })
    expect(sla?.level).toBe("breach")
    expect(sla?.label).toBe("1h30")
  })

  it("accepts ts in seconds OR milliseconds", () => {
    const inSeconds = Math.floor((NOW - 10 * 60_000) / 1000)
    const sla = computeSLA({
      chat: chat({
        last_direction: "in",
        unread_count: 1,
        last_message_ts: inSeconds,
      }),
      now: NOW,
    })
    expect(sla?.waitingMinutes).toBe(10)
  })
})

describe("formatDuration", () => {
  it("shows 'agora' for < 1min", () => {
    expect(formatDuration(0)).toBe("agora")
  })
  it("compact minutes", () => {
    expect(formatDuration(45)).toBe("45min")
  })
  it("hours without trailing minutes", () => {
    expect(formatDuration(120)).toBe("2h")
  })
  it("hours with trailing minutes uses zero-padding", () => {
    expect(formatDuration(125)).toBe("2h05")
  })
  it("days after 24h", () => {
    expect(formatDuration(60 * 25)).toBe("1d")
  })
})
