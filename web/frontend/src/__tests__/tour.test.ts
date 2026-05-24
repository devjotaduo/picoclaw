import { describe, expect, it } from "vitest"

import { getNextTourStep, getPrevTourStep } from "@/store/tour"

describe("tour navigation", () => {
  it("skips targeted steps that are not available", () => {
    const available = (step: string) => step !== "gateway"

    expect(getNextTourStep("models", available)).toBe("docs")
    expect(getPrevTourStep("docs", available)).toBe("models")
  })
})
