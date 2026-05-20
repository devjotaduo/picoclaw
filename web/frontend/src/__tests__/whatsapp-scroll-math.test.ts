import { describe, expect, it } from "vitest"

import {
  AUTOSCROLL_THRESHOLD_PX,
  distanceFromBottom,
  isNearBottom,
  shouldAutoscroll,
} from "@/lib/whatsapp/scroll-math"

describe("distanceFromBottom", () => {
  it("returns 0 when scrolled all the way down", () => {
    expect(
      distanceFromBottom({
        scrollTop: 800,
        scrollHeight: 1000,
        clientHeight: 200,
      }),
    ).toBe(0)
  })

  it("returns the gap when scrolled up", () => {
    expect(
      distanceFromBottom({
        scrollTop: 0,
        scrollHeight: 1000,
        clientHeight: 200,
      }),
    ).toBe(800)
  })

  it("clamps to 0 instead of going negative", () => {
    expect(
      distanceFromBottom({
        scrollTop: 1000,
        scrollHeight: 1000,
        clientHeight: 200,
      }),
    ).toBe(0)
  })
})

describe("isNearBottom", () => {
  it("treats distance <= threshold as near-bottom", () => {
    expect(
      isNearBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 200 }),
    ).toBe(true)
    expect(
      isNearBottom({ scrollTop: 750, scrollHeight: 1000, clientHeight: 200 }),
    ).toBe(true)
  })

  it("treats distance > threshold as far-from-bottom", () => {
    expect(
      isNearBottom({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 }),
    ).toBe(false)
  })

  it("exposes the threshold for callers that show 'new messages' buttons", () => {
    expect(AUTOSCROLL_THRESHOLD_PX).toBeGreaterThan(0)
  })
})

describe("shouldAutoscroll", () => {
  it("force=true overrides distance check (used when user sends a message)", () => {
    expect(
      shouldAutoscroll(
        { scrollTop: 0, scrollHeight: 5000, clientHeight: 200 },
        { force: true },
      ),
    ).toBe(true)
  })

  it("returns false when user has scrolled far up and force is not set", () => {
    expect(
      shouldAutoscroll({ scrollTop: 0, scrollHeight: 5000, clientHeight: 200 }),
    ).toBe(false)
  })
})
