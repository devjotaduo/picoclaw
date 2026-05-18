import { describe, expect, it } from "vitest"

import {
  findMatches,
  hasMatch,
  splitByMatches,
} from "@/lib/whatsapp/search-highlight"

describe("findMatches", () => {
  it("returns [] for empty query", () => {
    expect(findMatches("anything", "")).toEqual([])
    expect(findMatches("anything", "   ")).toEqual([])
  })

  it("finds non-overlapping ranges in order", () => {
    expect(findMatches("ababab", "ab")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ])
  })

  it("is case-insensitive", () => {
    expect(findMatches("João da Silva", "joão")).toEqual([{ start: 0, end: 4 }])
    expect(findMatches("HELLO", "hello")).toEqual([{ start: 0, end: 5 }])
  })

  it("is accent-insensitive (PT-BR ergonomics)", () => {
    expect(findMatches("São Paulo", "sao paulo")).toEqual([
      { start: 0, end: 9 },
    ])
    expect(findMatches("órão", "orao")).toEqual([{ start: 0, end: 4 }])
  })
})

describe("hasMatch", () => {
  it("short-circuits for blank queries", () => {
    expect(hasMatch("foo", "")).toBe(false)
    expect(hasMatch("foo", "   ")).toBe(false)
  })
  it("returns true on partial substring", () => {
    expect(hasMatch("conversação", "versa")).toBe(true)
  })
})

describe("splitByMatches", () => {
  it("returns a single non-matching segment when no matches", () => {
    expect(splitByMatches("foo", "bar")).toEqual([
      { text: "foo", match: false },
    ])
  })

  it("interleaves plain and matching segments", () => {
    expect(splitByMatches("foo bar foo", "foo")).toEqual([
      { text: "foo", match: true },
      { text: " bar ", match: false },
      { text: "foo", match: true },
    ])
  })

  it("returns the original casing on the highlighted segment", () => {
    expect(splitByMatches("HELLO world", "hello")).toEqual([
      { text: "HELLO", match: true },
      { text: " world", match: false },
    ])
  })
})
