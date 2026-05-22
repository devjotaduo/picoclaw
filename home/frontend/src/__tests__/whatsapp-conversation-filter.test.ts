import { describe, expect, it } from "vitest"

import type { WhatsAppChat, WhatsAppContactProfile } from "@/api/whatsapp"
import {
  applyFilter,
  applySort,
  collectTags,
} from "@/lib/whatsapp/conversation-filter"

function chat(
  jid: string,
  overrides: Partial<WhatsAppChat> = {},
): WhatsAppChat {
  return {
    jid,
    last_message_ts: 100,
    paused: false,
    unread_count: 0,
    updated_at: 100,
    ...overrides,
  }
}

function profile(
  overrides: Partial<WhatsAppContactProfile>,
): WhatsAppContactProfile {
  return {
    chat_jid: overrides.chat_jid ?? "x",
    lead_stage: "lead",
    lead_score: 0,
    priority: "none",
    consent_status: "unknown",
    tags: [],
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

describe("applyFilter", () => {
  const chats = [
    chat("a", { unread_count: 2 }),
    chat("b", { unread_count: 0 }),
    chat("c", { paused: true }),
    chat("d", { unread_count: 1, paused: true }),
  ]

  it("'all' returns every chat", () => {
    expect(applyFilter(chats, "all")).toHaveLength(chats.length)
  })
  it("'unread' keeps only chats with unread_count > 0", () => {
    const out = applyFilter(chats, "unread")
    expect(out.map((c) => c.jid)).toEqual(["a", "d"])
  })
  it("'paused' keeps only paused chats", () => {
    const out = applyFilter(chats, "paused")
    expect(out.map((c) => c.jid)).toEqual(["c", "d"])
  })

  it("'mine' matches assigned_to == me (case-insensitive)", () => {
    const profiles = {
      a: profile({ chat_jid: "a", assigned_to: "Ana" }),
      b: profile({ chat_jid: "b", assigned_to: "bruno" }),
      c: profile({ chat_jid: "c" }),
      d: profile({ chat_jid: "d", assigned_to: "ANA" }),
    }
    expect(
      applyFilter(chats, "mine", { profilesByJid: profiles, me: "ana" }).map(
        (c) => c.jid,
      ),
    ).toEqual(["a", "d"])
  })

  it("'mine' with no `me` returns every assigned chat", () => {
    const profiles = {
      a: profile({ chat_jid: "a", assigned_to: "Ana" }),
      b: profile({ chat_jid: "b" }),
    }
    expect(
      applyFilter(chats, "mine", { profilesByJid: profiles }).map((c) => c.jid),
    ).toEqual(["a"])
  })

  it("'tag' filters case-insensitively across the profile cache", () => {
    const profiles = {
      a: profile({ chat_jid: "a", tags: ["VIP", "novo"] }),
      b: profile({ chat_jid: "b", tags: ["vip"] }),
      c: profile({ chat_jid: "c", tags: [] }),
    }
    expect(
      applyFilter(chats, "tag", { profilesByJid: profiles, tag: "vip" }).map(
        (c) => c.jid,
      ),
    ).toEqual(["a", "b"])
  })
})

describe("applySort", () => {
  it("'recent' sorts by last_message_ts desc", () => {
    const out = applySort(
      [
        chat("a", { last_message_ts: 1 }),
        chat("b", { last_message_ts: 3 }),
        chat("c", { last_message_ts: 2 }),
      ],
      "recent",
    )
    expect(out.map((c) => c.jid)).toEqual(["b", "c", "a"])
  })

  it("'priority' sorts high → medium → low → none, tiebreaks by recency", () => {
    const profiles = {
      a: profile({ chat_jid: "a", priority: "low" }),
      b: profile({ chat_jid: "b", priority: "high" }),
      c: profile({ chat_jid: "c", priority: "high" }),
      d: profile({ chat_jid: "d", priority: "medium" }),
    }
    const out = applySort(
      [
        chat("a", { last_message_ts: 4 }),
        chat("b", { last_message_ts: 1 }),
        chat("c", { last_message_ts: 3 }),
        chat("d", { last_message_ts: 2 }),
      ],
      "priority",
      { profilesByJid: profiles },
    )
    expect(out.map((c) => c.jid)).toEqual(["c", "b", "d", "a"])
  })
})

describe("collectTags", () => {
  it("returns distinct tags sorted PT-BR", () => {
    const profiles = {
      a: profile({ chat_jid: "a", tags: ["vip", "novo"] }),
      b: profile({ chat_jid: "b", tags: ["VIP", "ônibus"] }),
    }
    expect(collectTags(profiles)).toEqual(["novo", "ônibus", "vip"])
  })
  it("handles empty cache", () => {
    expect(collectTags({})).toEqual([])
  })
})
