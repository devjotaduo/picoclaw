import { describe, expect, it } from "vitest"

import { contrastInfo, contrastRatio } from "./contrast"

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0)
  })

  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#2563eb", "#2563eb")).toBeCloseTo(1, 2)
  })

  it("is symmetric", () => {
    const a = contrastRatio("#2563eb", "#ffffff")
    const b = contrastRatio("#ffffff", "#2563eb")
    expect(a).toBeCloseTo(b, 5)
  })

  it("handles 3-char hex shorthand", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 0)
  })

  it("returns 0 for invalid hex", () => {
    expect(contrastRatio("not-a-color", "#fff")).toBe(0)
  })
})

describe("contrastInfo", () => {
  it("classifies black/white as AAA", () => {
    const info = contrastInfo("#000000", "#ffffff")
    expect(info.level).toBe("AAA")
    expect(info.label).toContain("AAA")
  })

  it("classifies a typical brand blue on white as AA", () => {
    const info = contrastInfo("#ffffff", "#2563eb")
    expect(["AA", "AAA"]).toContain(info.level)
  })

  it("classifies low-contrast pair as fail", () => {
    const info = contrastInfo("#bbbbbb", "#cccccc")
    expect(info.level).toBe("fail")
  })

  it("includes ratio in label", () => {
    const info = contrastInfo("#000000", "#ffffff")
    expect(info.label).toMatch(/Contraste:\s*\d+(\.\d+)?:1/)
  })
})
