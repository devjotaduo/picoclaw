import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  type QuickReply,
  listQuickReplies,
  renderQuickReply,
  searchQuickReplies,
  upsertQuickReply,
} from "@/lib/whatsapp/quick-replies"

// JSDOM-less environment — give the lib a stubbed localStorage so it can persist.
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

beforeEach(() => {
  // The createLocalStore wrapper guards `window`, so we have to attach one.
  vi.stubGlobal("window", {
    localStorage: new MemoryStorage(),
    addEventListener: () => {},
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("searchQuickReplies", () => {
  it("returns the seed catalog when query is empty", () => {
    expect(searchQuickReplies("").length).toBeGreaterThan(0)
  })

  it("matches by shortcut, title, body — case insensitive, strips leading '/'", () => {
    const out = searchQuickReplies("/ola")
    expect(out.some((r) => r.shortcut === "ola")).toBe(true)
  })

  it("returns [] when nothing matches", () => {
    expect(searchQuickReplies("zzz-no-match")).toEqual([])
  })
})

describe("renderQuickReply", () => {
  it("substitutes the {{name}} placeholder (case/space insensitive)", () => {
    const reply: QuickReply = {
      id: "x",
      shortcut: "oi",
      title: "Oi",
      body: "Olá {{name}}, tudo bem com {{ Name }}?",
    }
    expect(renderQuickReply(reply, { name: "Brendo" })).toBe(
      "Olá Brendo, tudo bem com Brendo?",
    )
  })
  it("collapses empty names so the message reads naturally", () => {
    const reply: QuickReply = {
      id: "x",
      shortcut: "oi",
      title: "Oi",
      body: "Olá {{name}}!",
    }
    expect(renderQuickReply(reply, {})).toBe("Olá !")
  })
})

describe("upsertQuickReply", () => {
  it("adds a new reply and lets it be retrieved", () => {
    upsertQuickReply({
      id: "custom-1",
      shortcut: "promo",
      title: "Promo",
      body: "Estamos com promoção essa semana!",
    })
    expect(listQuickReplies().some((r) => r.id === "custom-1")).toBe(true)
  })
  it("updates an existing reply by id", () => {
    upsertQuickReply({ id: "k", shortcut: "a", title: "A", body: "old" })
    upsertQuickReply({ id: "k", shortcut: "a", title: "A", body: "new" })
    const found = listQuickReplies().find((r) => r.id === "k")
    expect(found?.body).toBe("new")
  })
})
