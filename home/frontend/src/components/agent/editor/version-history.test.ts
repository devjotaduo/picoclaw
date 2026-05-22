import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { TemplateApplyPayload } from "@/components/agent/templates/types"

import {
  appendVersion,
  deleteVersion,
  diffPayload,
  formatPayload,
  loadVersions,
} from "./version-history"

class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null
  }
  getItem(k: string) {
    return this.store.has(k) ? (this.store.get(k) as string) : null
  }
  setItem(k: string, v: string) {
    this.store.set(k, v)
  }
  removeItem(k: string) {
    this.store.delete(k)
  }
  clear() {
    this.store.clear()
  }
}

const ORIGINAL_WINDOW = globalThis.window

beforeEach(() => {
  ;(globalThis as { window: unknown }).window = {
    localStorage: new MemoryStorage(),
  }
})

afterEach(() => {
  ;(globalThis as { window: unknown }).window = ORIGINAL_WINDOW
})

function fakePayload(
  overrides: Partial<TemplateApplyPayload> = {},
): TemplateApplyPayload {
  return {
    template_id: "atendente-geral",
    name: "Ana",
    short_description: "Atende",
    presentation: "Atende com cordialidade.",
    personality: [],
    values: [],
    functions: [],
    prohibitions: [],
    protections: [],
    company_info: {} as TemplateApplyPayload["company_info"],
    language: "pt-BR" as TemplateApplyPayload["language"],
    tone: "neutro" as TemplateApplyPayload["tone"],
    skill_configs: [],
    conversation_flow: [],
    required_fields_by_intent: {},
    response_examples: {} as TemplateApplyPayload["response_examples"],
    knowledge_base: { overview: "", faqs: [] },
    style_guide: { do: [], dont: [] } as TemplateApplyPayload["style_guide"],
    fallback_policy: {
      max_clarifying_questions: 1,
      when_unsure: "",
      when_to_route: [],
      route_message: "",
    },
    handoff_summary_template:
      {} as TemplateApplyPayload["handoff_summary_template"],
    structured_output_template:
      {} as TemplateApplyPayload["structured_output_template"],
    priority_rules: {} as TemplateApplyPayload["priority_rules"],
    knowledge_policy: [],
    security_rules: [],
    quality_metrics: [],
    modules: {} as TemplateApplyPayload["modules"],
    professionals: [],
    products: [],
    recommended_tools: [],
    tool_namespaces: [],
    required_integrations: [],
    permission_level: "standard" as TemplateApplyPayload["permission_level"],
    approval_required_for: [],
    behavior: {} as TemplateApplyPayload["behavior"],
    ...overrides,
  }
}

describe("appendVersion + loadVersions (fallback localStorage path)", () => {
  // The server endpoint is unreachable in the unit test environment;
  // appendVersion/loadVersions silently fall back to localStorage.
  it("stores and reads back a version", async () => {
    await appendVersion("ana", fakePayload(), "Label A")
    const list = await loadVersions("ana")
    expect(list).toHaveLength(1)
    expect(list[0]?.label).toBe("Label A")
  })

  it("returns newest first", async () => {
    await appendVersion("ana", fakePayload({ name: "v1" }), "first")
    await appendVersion("ana", fakePayload({ name: "v2" }), "second")
    const list = await loadVersions("ana")
    expect(list[0]?.label).toBe("second")
    expect(list[1]?.label).toBe("first")
  })

  it("caps at 20 versions per agent", async () => {
    for (let i = 0; i < 25; i++) {
      await appendVersion("ana", fakePayload({ name: `v${i}` }), `label-${i}`)
    }
    const list = await loadVersions("ana")
    expect(list).toHaveLength(20)
  })

  it("isolates versions per agent", async () => {
    await appendVersion("ana", fakePayload(), "Ana label")
    await appendVersion("leo", fakePayload(), "Leo label")
    expect(await loadVersions("ana")).toHaveLength(1)
    expect(await loadVersions("leo")).toHaveLength(1)
    expect((await loadVersions("ana"))[0]?.label).toBe("Ana label")
  })
})

describe("deleteVersion", () => {
  it("removes a version by id", async () => {
    const created = await appendVersion("ana", fakePayload(), "to delete")
    await deleteVersion("ana", created.id)
    expect(await loadVersions("ana")).toHaveLength(0)
  })

  it("does nothing for unknown agent", async () => {
    await expect(deleteVersion("ghost", "x")).resolves.toBeUndefined()
  })
})

describe("formatPayload", () => {
  it("returns pretty JSON for a payload", () => {
    const out = formatPayload(fakePayload({ name: "Ana" }))
    expect(out).toContain('"name": "Ana"')
  })

  it("returns empty for null", () => {
    expect(formatPayload(null)).toBe("")
  })
})

describe("diffPayload", () => {
  it("marks changed lines as add/remove", () => {
    const a = fakePayload({ name: "Ana" })
    const b = fakePayload({ name: "Bia" })
    const lines = diffPayload(a, b)
    const hasRemove = lines.some(
      (l) => l.kind === "remove" && l.value.includes("Ana"),
    )
    const hasAdd = lines.some(
      (l) => l.kind === "add" && l.value.includes("Bia"),
    )
    expect(hasRemove).toBe(true)
    expect(hasAdd).toBe(true)
  })

  it("returns empty (or only context) when payloads are identical", () => {
    const lines = diffPayload(fakePayload(), fakePayload())
    expect(lines.every((l) => l.kind === "context")).toBe(true)
  })
})
