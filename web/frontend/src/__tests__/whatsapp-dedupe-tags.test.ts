import { describe, expect, it } from "vitest"

import { dedupeTags } from "@/lib/whatsapp/dedupe-tags"

describe("dedupeTags", () => {
  it("returns empty buckets for null/undefined/empty input", () => {
    expect(dedupeTags(null)).toEqual({ visible: [], overflow: [], total: 0 })
    expect(dedupeTags(undefined)).toEqual({ visible: [], overflow: [], total: 0 })
    expect(dedupeTags([])).toEqual({ visible: [], overflow: [], total: 0 })
  })

  it("deduplicates case-insensitively, preserving first-seen casing", () => {
    const result = dedupeTags(["duvida_geral", "VIP", "duvida_geral", "Vip"])
    expect(result.visible).toEqual(["duvida_geral", "VIP"])
    expect(result.overflow).toEqual([])
    expect(result.total).toBe(2)
  })

  it("trims whitespace and drops empty entries", () => {
    expect(dedupeTags(["  ", "  vip ", "vip"]).visible).toEqual(["vip"])
  })

  it("respects the limit (default 3)", () => {
    const result = dedupeTags(["a", "b", "c", "d", "e"])
    expect(result.visible).toEqual(["a", "b", "c"])
    expect(result.overflow).toEqual(["d", "e"])
    expect(result.total).toBe(5)
  })

  it("accepts a custom limit", () => {
    const result = dedupeTags(["a", "b", "c", "d"], 2)
    expect(result.visible).toEqual(["a", "b"])
    expect(result.overflow).toEqual(["c", "d"])
  })

  it("regression: 'duvida_geral' must never appear twice in the visible list", () => {
    const result = dedupeTags(["duvida_geral", "duvida_geral", "duvida_geral"])
    expect(result.visible).toEqual(["duvida_geral"])
    expect(result.total).toBe(1)
  })
})
