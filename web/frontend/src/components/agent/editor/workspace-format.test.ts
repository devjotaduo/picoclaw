import { describe, expect, it } from "vitest"

import { workspaceFriendlyName } from "./workspace-format"

describe("workspaceFriendlyName", () => {
  it("returns 'Principal' for default agent regardless of path", () => {
    expect(workspaceFriendlyName("/root/.picoclaw/workspace", true)).toBe(
      "Principal",
    )
  })

  it("returns 'Principal' for default 'workspace' segment", () => {
    expect(workspaceFriendlyName("/root/.picoclaw/workspace")).toBe("Principal")
  })

  it("derives capitalized label from workspace-<id> directory", () => {
    expect(workspaceFriendlyName("/root/.picoclaw/workspace-sales")).toBe(
      "Sales",
    )
  })

  it("uses last segment when not prefixed with workspace-", () => {
    expect(workspaceFriendlyName("/srv/agents/marketing")).toBe("Marketing")
  })

  it("never leaks /root path", () => {
    const out = workspaceFriendlyName("/root/.picoclaw/workspace-vendas")
    expect(out).not.toContain("/")
    expect(out).not.toContain("root")
  })

  it("falls back when empty", () => {
    expect(workspaceFriendlyName("", false)).toBe("Personalizado")
    expect(workspaceFriendlyName("", true)).toBe("Principal")
  })
})
