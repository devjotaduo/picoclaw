import { describe, expect, it } from "vitest"

import type { TemplateApplyPayload } from "@/components/agent/templates/types"

import { isReadyToActivate, validateChecklist } from "./schemas"

function payload(
  patch: Partial<TemplateApplyPayload> = {},
): TemplateApplyPayload {
  return {
    template_id: "atendente-geral",
    name: "Ana",
    short_description: "Atendimento padrão",
    presentation: "Atende clientes com cordialidade.",
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
    knowledge_base: {
      overview: "",
      faqs: [],
    },
    style_guide: {
      do: [],
      dont: [],
    } as TemplateApplyPayload["style_guide"],
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
    modules: {
      professionals_enabled: false,
      products_enabled: false,
    } as TemplateApplyPayload["modules"],
    professionals: [],
    products: [],
    recommended_tools: [],
    tool_namespaces: [],
    required_integrations: [],
    permission_level: "standard" as TemplateApplyPayload["permission_level"],
    approval_required_for: [],
    behavior: {} as TemplateApplyPayload["behavior"],
    ...patch,
  }
}

describe("validateChecklist", () => {
  it("marks identity complete when name and template_id present", () => {
    const steps = validateChecklist({
      payload: payload(),
      roleConfigDraft: JSON.stringify({ kind: "attendant" }),
      mainAgentID: "main",
      assistantPhones: [],
      assistantGroups: [],
    })
    const identity = steps.find((s) => s.id === "identity")
    expect(identity?.status).toBe("complete")
  })

  it("marks identity error when name missing", () => {
    const steps = validateChecklist({
      payload: payload({ name: "" }),
      roleConfigDraft: "{}",
      mainAgentID: "main",
      assistantPhones: [],
      assistantGroups: [],
    })
    expect(steps.find((s) => s.id === "identity")?.status).toBe("error")
  })

  it("marks role error when JSON invalid", () => {
    const steps = validateChecklist({
      payload: payload(),
      roleConfigDraft: "{ not json",
      mainAgentID: "main",
      assistantPhones: [],
      assistantGroups: [],
    })
    expect(steps.find((s) => s.id === "role")?.status).toBe("error")
  })

  it("marks knowledge partial when no skills and no modules", () => {
    const steps = validateChecklist({
      payload: payload({
        skill_configs: [],
        modules: {
          professionals_enabled: false,
          products_enabled: false,
        } as TemplateApplyPayload["modules"],
      }),
      roleConfigDraft: "{}",
      mainAgentID: "main",
      assistantPhones: [],
      assistantGroups: [],
    })
    expect(steps.find((s) => s.id === "knowledge")?.status).toBe("partial")
  })

  it("rejects malformed phone numbers in routing", () => {
    const steps = validateChecklist({
      payload: payload(),
      roleConfigDraft: "{}",
      mainAgentID: "main",
      assistantPhones: ["123"],
      assistantGroups: [],
    })
    expect(steps.find((s) => s.id === "routing")?.status).toBe("error")
  })
})

describe("isReadyToActivate", () => {
  it("returns true when all steps are complete or partial", () => {
    expect(
      isReadyToActivate([
        { id: "identity", status: "complete", missing: [] },
        { id: "role", status: "complete", missing: [] },
        { id: "prompt", status: "complete", missing: [] },
        { id: "knowledge", status: "partial", missing: [] },
        { id: "routing", status: "complete", missing: [] },
      ]),
    ).toBe(true)
  })

  it("returns false when any step has error", () => {
    expect(
      isReadyToActivate([
        { id: "identity", status: "complete", missing: [] },
        { id: "role", status: "error", missing: ["bad"] },
        { id: "prompt", status: "complete", missing: [] },
        { id: "knowledge", status: "complete", missing: [] },
        { id: "routing", status: "complete", missing: [] },
      ]),
    ).toBe(false)
  })
})
