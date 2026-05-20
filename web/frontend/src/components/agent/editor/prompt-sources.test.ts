import { describe, expect, it } from "vitest"

import type { TemplateApplyPayload } from "@/components/agent/templates/types"

import { describePayloadSources } from "./prompt-sources"

function payload(
  overrides: Partial<TemplateApplyPayload> = {},
): TemplateApplyPayload {
  return {
    template_id: "atendente-geral",
    name: "Ana",
    short_description: "",
    presentation: "Atende",
    personality: [],
    values: [],
    functions: ["Qualificar lead"],
    prohibitions: [],
    protections: [],
    company_info: { name: "JotaDuo" } as TemplateApplyPayload["company_info"],
    language: "pt-BR" as TemplateApplyPayload["language"],
    tone: "neutro" as TemplateApplyPayload["tone"],
    skill_configs: [{ name: "search", enabled: true, visible: true }],
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

describe("describePayloadSources", () => {
  it("yields a Profile section for the name", () => {
    const sections = describePayloadSources(payload())
    expect(
      sections.some((s) => s.source === "profile" && s.key === "name"),
    ).toBe(true)
  })

  it("classifies functions under Role", () => {
    const sections = describePayloadSources(payload())
    expect(
      sections.some((s) => s.source === "role" && s.key === "functions"),
    ).toBe(true)
  })

  it("counts active skills under Skills", () => {
    const sections = describePayloadSources(
      payload({
        skill_configs: [
          { name: "search", enabled: true, visible: true },
          { name: "rag", enabled: false, visible: true },
        ],
      }),
    )
    const skills = sections.find((s) => s.source === "skills")
    expect(skills?.label).toMatch(/1 ativa/)
  })

  it("omits Skills section when none are enabled", () => {
    const sections = describePayloadSources(
      payload({
        skill_configs: [{ name: "x", enabled: false, visible: false }],
      }),
    )
    expect(sections.find((s) => s.source === "skills")).toBeUndefined()
  })

  it("emits a Context section for the company name", () => {
    const sections = describePayloadSources(payload())
    expect(
      sections.some((s) => s.source === "context" && s.key === "company"),
    ).toBe(true)
  })

  it("emits a Meta section with the template id", () => {
    const sections = describePayloadSources(payload())
    const meta = sections.find(
      (s) => s.source === "meta" && s.key === "template",
    )
    expect(meta?.preview).toBe("atendente-geral")
  })
})
