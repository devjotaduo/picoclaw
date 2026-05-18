import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { buildUnavailableToolMessages } from "@/components/agent/hub/tool-support"

// Minimal TFunction mock: returns the key as-is
const t = ((key: string) => key) as unknown as TFunction

type ToolLike = { status: "enabled" | "disabled" | "blocked"; reason_code?: string }

describe("buildUnavailableToolMessages", () => {
  it("returns empty array when both tools are undefined", () => {
    const result = buildUnavailableToolMessages({
      searchTool: undefined,
      installTool: undefined,
      t,
    })
    expect(result).toEqual([])
  })

  it("returns empty array when both tools are enabled", () => {
    const enabled: ToolLike = { status: "enabled" }
    const result = buildUnavailableToolMessages({
      searchTool: enabled,
      installTool: enabled,
      t,
    })
    expect(result).toEqual([])
  })

  it("includes search message when searchTool is disabled without reason_code", () => {
    const result = buildUnavailableToolMessages({
      searchTool: { status: "disabled" },
      installTool: undefined,
      t,
    })
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe("search")
    expect(result[0].message).toBe(
      "pages.agent.skills.marketplace_status_disabled",
    )
  })

  it("includes install message when installTool is disabled with reason_code", () => {
    const result = buildUnavailableToolMessages({
      searchTool: undefined,
      installTool: { status: "disabled", reason_code: "not_configured" },
      t,
    })
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe("install")
    // message should contain both the reason_code translation and the hint
    expect(result[0].message).toContain(
      "pages.agent.tools.reasons.not_configured",
    )
    expect(result[0].message).toContain(
      "pages.agent.skills.marketplace_status_enable_hint",
    )
  })

  it("includes both messages when both tools are unavailable", () => {
    const result = buildUnavailableToolMessages({
      searchTool: { status: "disabled" },
      installTool: { status: "blocked" },
      t,
    })
    expect(result).toHaveLength(2)
    const keys = result.map((r) => r.key)
    expect(keys).toContain("search")
    expect(keys).toContain("install")
  })

  it("does not include message when tool has status 'enabled' even with reason_code", () => {
    const result = buildUnavailableToolMessages({
      searchTool: { status: "enabled", reason_code: "some_reason" },
      installTool: undefined,
      t,
    })
    expect(result).toEqual([])
  })

  it("label for search uses marketplace_search_status key", () => {
    const result = buildUnavailableToolMessages({
      searchTool: { status: "disabled" },
      installTool: undefined,
      t,
    })
    expect(result[0].label).toBe("pages.agent.skills.marketplace_search_status")
  })

  it("label for install uses marketplace_install_status key", () => {
    const result = buildUnavailableToolMessages({
      searchTool: undefined,
      installTool: { status: "disabled" },
      t,
    })
    expect(result[0].label).toBe(
      "pages.agent.skills.marketplace_install_status",
    )
  })

  it("includes message for blocked status without reason_code", () => {
    const result = buildUnavailableToolMessages({
      searchTool: { status: "blocked" },
      installTool: undefined,
      t,
    })
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe(
      "pages.agent.skills.marketplace_status_disabled",
    )
  })

  it("searchTool with reason_code produces reason + hint in message", () => {
    const result = buildUnavailableToolMessages({
      searchTool: { status: "blocked", reason_code: "missing_api_key" },
      installTool: undefined,
      t,
    })
    expect(result[0].message).toContain(
      "pages.agent.tools.reasons.missing_api_key",
    )
    expect(result[0].message).toContain(
      "pages.agent.skills.marketplace_status_enable_hint",
    )
  })
})
