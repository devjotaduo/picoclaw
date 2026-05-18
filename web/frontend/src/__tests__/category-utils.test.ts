import { describe, expect, it } from "vitest"

import {
  compareTemplates,
  sortCategories,
} from "@/components/agent/templates/category-utils"
import type {
  AgentTemplate,
  TemplateCategory,
} from "@/components/agent/templates/types"

function makeTemplate(
  overrides: Partial<AgentTemplate> & {
    name: string
    category: TemplateCategory
  },
): AgentTemplate {
  return {
    id: overrides.name,
    icon: "",
    short_description: "",
    presentation: "",
    personality: [],
    values: [],
    functions: [],
    prohibitions: [],
    protections: [],
    company_info: {
      name: "",
      hours: "",
      contact: "",
      general_info: "",
      schedule: {
        monday: { open: false, from: "", to: "" },
        tuesday: { open: false, from: "", to: "" },
        wednesday: { open: false, from: "", to: "" },
        thursday: { open: false, from: "", to: "" },
        friday: { open: false, from: "", to: "" },
        saturday: { open: false, from: "", to: "" },
        sunday: { open: false, from: "", to: "" },
        notes: "",
      },
    },
    language: "pt-br",
    tone: "neutral",
    recommended_skills: [],
    conversation_flow: [],
    required_fields_by_intent: {},
    response_examples: {
      greeting: "",
      clarification: "",
      unknown_answer: "",
      routing: "",
      closing: "",
    },
    knowledge_base: {
      overview: "",
      faqs: [],
    },
    style_guide: { do: [], dont: [] },
    fallback_policy: {
      max_clarifying_questions: 3,
      when_unsure: "",
      when_to_route: [],
      route_message: "",
    },
    handoff_summary_template: {
      cliente: "",
      contato: "",
      motivo: "",
      resumo: "",
      dados_coletados: "",
      urgencia: "low",
      setor_destino: "",
      proxima_acao: "",
    },
    structured_output_template: {
      intent: "",
      confidence: "low",
      collected_fields: {},
      missing_fields: [],
      needs_routing: false,
      target_sector: "",
      priority: "low",
      summary: "",
      next_action: "",
    },
    priority_rules: { high: [], medium: [], low: [] },
    knowledge_policy: [],
    security_rules: [],
    quality_metrics: [],
    modules: { professionals_enabled: false, products_enabled: false },
    professionals: [],
    products: [],
    recommended_tools: [],
    tool_namespaces: [],
    required_integrations: [],
    permission_level: "read_only",
    approval_required_for: [],
    ...overrides,
  }
}

describe("sortCategories", () => {
  it("sorts categories in defined order", () => {
    const input: TemplateCategory[] = ["internal", "sales", "customer_service"]
    const result = sortCategories(input)
    expect(result).toEqual(["customer_service", "sales", "internal"])
  })

  it("returns empty array without error", () => {
    expect(sortCategories([])).toEqual([])
  })

  it("does not mutate the original array", () => {
    const input: TemplateCategory[] = ["support", "customer_service", "sales"]
    const copy = [...input]
    sortCategories(input)
    expect(input).toEqual(copy)
  })

  it("handles all four known categories", () => {
    const all: TemplateCategory[] = [
      "internal",
      "support",
      "sales",
      "customer_service",
    ]
    expect(sortCategories(all)).toEqual([
      "customer_service",
      "sales",
      "support",
      "internal",
    ])
  })

  it("keeps same order when categories are already sorted", () => {
    const sorted: TemplateCategory[] = [
      "customer_service",
      "sales",
      "support",
      "internal",
    ]
    expect(sortCategories(sorted)).toEqual(sorted)
  })
})

describe("compareTemplates", () => {
  it("customer_service comes before sales", () => {
    const a = makeTemplate({ name: "A", category: "customer_service" })
    const b = makeTemplate({ name: "B", category: "sales" })
    expect(compareTemplates(a, b)).toBeLessThan(0)
  })

  it("sales comes before support", () => {
    const a = makeTemplate({ name: "A", category: "sales" })
    const b = makeTemplate({ name: "B", category: "support" })
    expect(compareTemplates(a, b)).toBeLessThan(0)
  })

  it("support comes before internal", () => {
    const a = makeTemplate({ name: "A", category: "support" })
    const b = makeTemplate({ name: "B", category: "internal" })
    expect(compareTemplates(a, b)).toBeLessThan(0)
  })

  it("internal is greater than customer_service", () => {
    const a = makeTemplate({ name: "A", category: "internal" })
    const b = makeTemplate({ name: "B", category: "customer_service" })
    expect(compareTemplates(a, b)).toBeGreaterThan(0)
  })

  it("same category: orders alphabetically by name (case-insensitive)", () => {
    const a = makeTemplate({ name: "Atendimento", category: "sales" })
    const b = makeTemplate({ name: "Zeladoria", category: "sales" })
    expect(compareTemplates(a, b)).toBeLessThan(0)
    expect(compareTemplates(b, a)).toBeGreaterThan(0)
  })

  it("same category and same name: returns 0", () => {
    const a = makeTemplate({ name: "Template", category: "support" })
    const b = makeTemplate({ name: "Template", category: "support" })
    expect(compareTemplates(a, b)).toBe(0)
  })

  it("name comparison is case-insensitive", () => {
    const a = makeTemplate({ name: "abc", category: "internal" })
    const b = makeTemplate({ name: "ABC", category: "internal" })
    expect(compareTemplates(a, b)).toBe(0)
  })

  it("unknown category goes to the end (order 99)", () => {
    const known = makeTemplate({ name: "A", category: "internal" })
    const unknown = makeTemplate({
      name: "B",
      category: "unknown_cat" as TemplateCategory,
    })
    expect(compareTemplates(known, unknown)).toBeLessThan(0)
    expect(compareTemplates(unknown, known)).toBeGreaterThan(0)
  })
})
