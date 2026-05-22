import { describe, expect, it } from "vitest"

import type { AgentEditorAgent } from "@/api/agent-templates"

import {
  type AgentListControls,
  DEFAULT_AGENT_LIST_CONTROLS,
  applyAgentListControls,
} from "./agent-list-filter"

function fakeAgent(
  overrides: Partial<AgentEditorAgent> = {},
): AgentEditorAgent {
  return {
    id: overrides.id ?? "main",
    name: overrides.name ?? "Ana",
    workspace: "workspace",
    default: overrides.default ?? false,
    active: overrides.active ?? true,
    allowed: true,
    prompt: { configured: false },
    ...overrides,
  } as AgentEditorAgent
}

const sample: AgentEditorAgent[] = [
  fakeAgent({
    id: "main",
    name: "Ana",
    default: true,
    active: true,
    applied_at: 100,
  }),
  fakeAgent({ id: "vendas", name: "Leo", active: true, applied_at: 300 }),
  fakeAgent({ id: "marketing", name: "Maya", active: false, applied_at: 200 }),
  fakeAgent({ id: "assistente", name: "Sofia", active: true, applied_at: 50 }),
]

function withControls(patch: Partial<AgentListControls>): AgentListControls {
  return { ...DEFAULT_AGENT_LIST_CONTROLS, ...patch }
}

describe("applyAgentListControls", () => {
  it("returns all when no filters apply", () => {
    expect(
      applyAgentListControls(sample, DEFAULT_AGENT_LIST_CONTROLS),
    ).toHaveLength(4)
  })

  it("filters by status=active", () => {
    const out = applyAgentListControls(
      sample,
      withControls({ status: "active" }),
    )
    expect(out.map((a) => a.id)).toEqual(
      expect.arrayContaining(["main", "vendas", "assistente"]),
    )
    expect(out.find((a) => a.id === "marketing")).toBeUndefined()
  })

  it("filters by status=inactive", () => {
    const out = applyAgentListControls(
      sample,
      withControls({ status: "inactive" }),
    )
    expect(out.map((a) => a.id)).toEqual(["marketing"])
  })

  it("filters by search across name and id", () => {
    expect(
      applyAgentListControls(sample, withControls({ search: "leo" })).map(
        (a) => a.id,
      ),
    ).toEqual(["vendas"])
    expect(
      applyAgentListControls(sample, withControls({ search: "MAIN" })).map(
        (a) => a.id,
      ),
    ).toEqual(["main"])
  })

  it("sorts by name", () => {
    const out = applyAgentListControls(sample, withControls({ sort: "name" }))
    expect(out.map((a) => a.name)).toEqual(["Ana", "Leo", "Maya", "Sofia"])
  })

  it("sorts by last edited (applied_at desc)", () => {
    const out = applyAgentListControls(sample, withControls({ sort: "edited" }))
    expect(out.map((a) => a.id)).toEqual([
      "vendas",
      "marketing",
      "main",
      "assistente",
    ])
  })

  it("default sort puts default agent first", () => {
    const reshuffled = [
      sample[1],
      sample[2],
      sample[0],
      sample[3],
    ] as AgentEditorAgent[]
    const out = applyAgentListControls(reshuffled, DEFAULT_AGENT_LIST_CONTROLS)
    expect(out[0]?.id).toBe("main")
  })
})
