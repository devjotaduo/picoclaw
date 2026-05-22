import { describe, expect, it } from "vitest"

import {
  asStringArray,
  mergeUniqueStringItems,
  normalizeAllowFromValues,
  parseAllowFromInput,
  parseConservativeStringListInput,
  serializeStringArrayForSubmit,
} from "@/components/channels/channel-array-utils"

describe("asStringArray", () => {
  it("filters non-string values from mixed array", () => {
    expect(asStringArray([1, "a", null, "b", undefined, true])).toEqual([
      "a",
      "b",
    ])
  })

  it("returns empty array for non-array input", () => {
    expect(asStringArray("not-array")).toEqual([])
    expect(asStringArray(null)).toEqual([])
    expect(asStringArray(undefined)).toEqual([])
    expect(asStringArray(42)).toEqual([])
  })

  it("returns all items from a string-only array", () => {
    expect(asStringArray(["x", "y", "z"])).toEqual(["x", "y", "z"])
  })

  it("returns empty array for empty array input", () => {
    expect(asStringArray([])).toEqual([])
  })
})

describe("parseAllowFromInput", () => {
  it("splits by comma", () => {
    expect(parseAllowFromInput("alice,bob,carol")).toEqual([
      "alice",
      "bob",
      "carol",
    ])
  })

  it("splits by semicolon", () => {
    expect(parseAllowFromInput("alice;bob;carol")).toEqual([
      "alice",
      "bob",
      "carol",
    ])
  })

  it("splits by fullwidth semicolon (；)", () => {
    expect(parseAllowFromInput("alice；bob")).toEqual(["alice", "bob"])
  })

  it("splits by newline", () => {
    expect(parseAllowFromInput("alice\nbob\ncarol")).toEqual([
      "alice",
      "bob",
      "carol",
    ])
  })

  it("splits by tab", () => {
    expect(parseAllowFromInput("alice\tbob")).toEqual(["alice", "bob"])
  })

  it("splits by fullwidth comma (，)", () => {
    expect(parseAllowFromInput("alice，bob")).toEqual(["alice", "bob"])
  })

  it("splits by nakaten (、)", () => {
    expect(parseAllowFromInput("alice、bob")).toEqual(["alice", "bob"])
  })

  it("removes duplicate items", () => {
    expect(parseAllowFromInput("alice,bob,alice")).toEqual(["alice", "bob"])
  })

  it("filters empty items", () => {
    expect(parseAllowFromInput("alice,,bob,,")).toEqual(["alice", "bob"])
  })

  it("filters items that are only whitespace", () => {
    expect(parseAllowFromInput("alice,   ,bob")).toEqual(["alice", "bob"])
  })

  it("strips hidden zero-width chars from items when present", () => {
    // U+200B is zero-width space
    const input = "al​ice,bob"
    expect(parseAllowFromInput(input)).toEqual(["alice", "bob"])
  })

  it("returns empty array for blank input", () => {
    expect(parseAllowFromInput("")).toEqual([])
    expect(parseAllowFromInput("   ")).toEqual([])
  })

  it("handles multiple separator types mixed together", () => {
    expect(parseAllowFromInput("alice,bob\ncarol;dave")).toEqual([
      "alice",
      "bob",
      "carol",
      "dave",
    ])
  })

  it("performance: processes 10000 items in < 100ms", () => {
    const items = Array.from({ length: 10000 }, (_, i) => `user${i}`)
    const raw = items.join(",")
    const start = performance.now()
    const result = parseAllowFromInput(raw)
    const duration = performance.now() - start
    expect(result).toHaveLength(10000)
    expect(duration).toBeLessThan(100)
  })
})

describe("parseConservativeStringListInput", () => {
  it("splits by comma", () => {
    expect(parseConservativeStringListInput("a,b,c")).toEqual(["a", "b", "c"])
  })

  it("splits by fullwidth comma (，)", () => {
    expect(parseConservativeStringListInput("a，b")).toEqual(["a", "b"])
  })

  it("splits by newline", () => {
    expect(parseConservativeStringListInput("a\nb")).toEqual(["a", "b"])
  })

  it("splits by tab", () => {
    expect(parseConservativeStringListInput("a\tb")).toEqual(["a", "b"])
  })

  it("does NOT split by semicolon", () => {
    expect(parseConservativeStringListInput("a;b")).toEqual(["a;b"])
  })

  it("does NOT strip hidden chars", () => {
    // U+200B is zero-width space; conservative split preserves it
    const input = "al​ice,bob"
    const result = parseConservativeStringListInput(input)
    expect(result[0]).toContain("​")
  })

  it("removes duplicates and empty items", () => {
    expect(parseConservativeStringListInput("a,,a,b")).toEqual(["a", "b"])
  })
})

describe("normalizeAllowFromValues", () => {
  it("filters non-string items from array and strips hidden chars", () => {
    const value = ["al​ice", "bob", 42, null]
    expect(normalizeAllowFromValues(value)).toEqual(["alice", "bob"])
  })

  it("returns empty array for non-array", () => {
    expect(normalizeAllowFromValues("hello")).toEqual([])
  })

  it("removes duplicates", () => {
    expect(normalizeAllowFromValues(["a", "a", "b"])).toEqual(["a", "b"])
  })

  it("filters empty and whitespace-only strings", () => {
    expect(normalizeAllowFromValues(["", "  ", "a"])).toEqual(["a"])
  })
})

describe("mergeUniqueStringItems", () => {
  it("merges two arrays keeping unique items", () => {
    expect(mergeUniqueStringItems(["a"], ["a", "b"])).toEqual(["a", "b"])
  })

  it("preserves order: current items first, then new items", () => {
    expect(mergeUniqueStringItems(["b", "a"], ["c"])).toEqual(["b", "a", "c"])
  })

  it("handles empty arrays", () => {
    expect(mergeUniqueStringItems([], ["a", "b"])).toEqual(["a", "b"])
    expect(mergeUniqueStringItems(["a", "b"], [])).toEqual(["a", "b"])
    expect(mergeUniqueStringItems([], [])).toEqual([])
  })

  it("deduplicates across both arrays", () => {
    expect(mergeUniqueStringItems(["x", "y"], ["y", "z"])).toEqual([
      "x",
      "y",
      "z",
    ])
  })
})

describe("serializeStringArrayForSubmit", () => {
  it("joins array with newline separator", () => {
    expect(serializeStringArrayForSubmit(["a", "b"])).toBe("a\nb")
  })

  it("returns passthrough for non-array values", () => {
    expect(serializeStringArrayForSubmit("not-array")).toBe("not-array")
    expect(serializeStringArrayForSubmit(42)).toBe(42)
    expect(serializeStringArrayForSubmit(null)).toBe(null)
    expect(serializeStringArrayForSubmit(undefined)).toBe(undefined)
  })

  it("handles empty array", () => {
    expect(serializeStringArrayForSubmit([])).toBe("")
  })

  it("deduplicates before serializing", () => {
    expect(serializeStringArrayForSubmit(["a", "a", "b"])).toBe("a\nb")
  })

  it("filters non-string items before serializing", () => {
    expect(serializeStringArrayForSubmit(["a", 1, null, "b"])).toBe("a\nb")
  })
})
