import { describe, expect, it } from "vitest"

import { substituteAgentPlaceholders } from "@/components/agent/templates/substitute-placeholders"
import type { TemplateApplyPayload } from "@/components/agent/templates/types"

function makeDraft(
  overrides: Partial<TemplateApplyPayload> = {},
): TemplateApplyPayload {
  return {
    agent_id: "main",
    template_id: "test",
    name: "",
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
    skill_configs: [],
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
    behavior: {
      master_enabled: true,
      business_hours_only: false,
      out_of_hours_reply: "",
      respond_in_dm: true,
      respond_in_groups: true,
      group_mention_only: false,
      keyword_trigger: "",
      outbound_only_mode: false,
      ignore_other_bots: false,
      ignore_forwarded_messages: false,
      ignore_self_messages: true,
      process_images: true,
      process_documents: true,
      process_audio: true,
      process_video: true,
      process_stickers: true,
      process_location: true,
      max_media_size_mb: 0,
      session_timeout_minutes: 0,
      max_messages_per_session: 0,
      mask_pii_in_replies: false,
      store_received_media: true,
      max_messages_per_minute_per_user: 0,
      response_cooldown_seconds: 0,
      handoff_keywords: [],
      handoff_after_failures: 0,
    },
    ...overrides,
  }
}

describe("substituteAgentPlaceholders", () => {
  it("substitutes {agent.name} when draft.name is set", () => {
    const draft = makeDraft({
      name: "Júlia",
      presentation: "Olá, sou {agent.name}!",
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.presentation).toBe("Olá, sou Júlia!")
  })

  it("substitutes {company.name} when company_info.name is set", () => {
    const draft = makeDraft({
      company_info: { ...makeDraft().company_info, name: "Loja ABC" },
      presentation: "Bem-vindo à {company.name}.",
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.presentation).toBe("Bem-vindo à Loja ABC.")
  })

  it("returns same object reference when both agent and company are blank", () => {
    const draft = makeDraft({
      name: "",
      company_info: { ...makeDraft().company_info, name: "" },
      presentation: "{agent.name} da {company.name}",
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result).toBe(draft)
  })

  it("only substitutes {company.name} when agent name is blank", () => {
    const draft = makeDraft({
      name: "",
      company_info: { ...makeDraft().company_info, name: "Empresa X" },
      presentation: "{agent.name} da {company.name}",
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.presentation).toBe("{agent.name} da Empresa X")
  })

  it("only substitutes {agent.name} when company name is blank", () => {
    const draft = makeDraft({
      name: "Maria",
      company_info: { ...makeDraft().company_info, name: "" },
      presentation: "{agent.name} da {company.name}",
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.presentation).toBe("Maria da {company.name}")
  })

  it("substitutes all items in conversation_flow array", () => {
    const draft = makeDraft({
      name: "Bot",
      company_info: { ...makeDraft().company_info, name: "Corp" },
      conversation_flow: [
        "Sou {agent.name}.",
        "Trabalho para {company.name}.",
        "Texto sem placeholder.",
      ],
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.conversation_flow).toEqual([
      "Sou Bot.",
      "Trabalho para Corp.",
      "Texto sem placeholder.",
    ])
  })

  it("substitutes in all response_examples fields", () => {
    const draft = makeDraft({
      name: "Aria",
      company_info: { ...makeDraft().company_info, name: "Minha Empresa" },
      response_examples: {
        greeting: "Olá de {agent.name}",
        clarification: "Clarification de {company.name}",
        unknown_answer: "Não sei, {agent.name} aqui.",
        routing: "Roteando para {company.name}",
        closing: "Até logo, {agent.name}",
      },
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.response_examples?.greeting).toBe("Olá de Aria")
    expect(result.response_examples?.clarification).toBe(
      "Clarification de Minha Empresa",
    )
    expect(result.response_examples?.unknown_answer).toBe("Não sei, Aria aqui.")
    expect(result.response_examples?.routing).toBe(
      "Roteando para Minha Empresa",
    )
    expect(result.response_examples?.closing).toBe("Até logo, Aria")
  })

  it("substitutes in knowledge_base overview and FAQs", () => {
    const draft = makeDraft({
      name: "Carlão",
      company_info: { ...makeDraft().company_info, name: "Barateiro" },
      knowledge_base: {
        overview:
          "{company.name} trabalha com atendimento feito por {agent.name}.",
        faqs: [
          {
            question: "Quem atende na {company.name}?",
            answer: "{agent.name} acompanha o atendimento por aqui.",
          },
        ],
      },
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.knowledge_base.overview).toBe(
      "Barateiro trabalha com atendimento feito por Carlão.",
    )
    expect(result.knowledge_base.faqs[0].question).toBe(
      "Quem atende na Barateiro?",
    )
    expect(result.knowledge_base.faqs[0].answer).toBe(
      "Carlão acompanha o atendimento por aqui.",
    )
  })

  it("substitutes in fallback_policy fields", () => {
    const draft = makeDraft({
      name: "Ana",
      fallback_policy: {
        max_clarifying_questions: 3,
        when_unsure: "Pergunte a {agent.name}",
        route_message: "Conectando via {company.name}",
        when_to_route: [
          "Quando {agent.name} não souber",
          "Quando {company.name} exigir",
        ],
      },
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.fallback_policy?.when_unsure).toBe("Pergunte a Ana")
    expect(result.fallback_policy?.route_message).toBe(
      "Conectando via {company.name}",
    )
    expect(result.fallback_policy?.when_to_route).toEqual([
      "Quando Ana não souber",
      "Quando {company.name} exigir",
    ])
  })

  it("substitutes in behavior.out_of_hours_reply", () => {
    const draft = makeDraft({
      name: "Bot",
      behavior: {
        ...makeDraft().behavior,
        out_of_hours_reply: "Fora do horário. Sou {agent.name}.",
      },
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.behavior?.out_of_hours_reply).toBe(
      "Fora do horário. Sou Bot.",
    )
  })

  it("does NOT substitute in draft.name", () => {
    const draft = makeDraft({ name: "Juliana" })
    const result = substituteAgentPlaceholders(draft)
    expect(result.name).toBe("Juliana")
  })

  it("does NOT substitute in draft.company_info.name", () => {
    const draft = makeDraft({
      company_info: { ...makeDraft().company_info, name: "Loja Teste" },
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.company_info.name).toBe("Loja Teste")
  })

  it("substitutes multiple occurrences of the same placeholder in one string", () => {
    const draft = makeDraft({
      name: "X",
      presentation: "{agent.name} e {agent.name} e {agent.name}",
    })
    const result = substituteAgentPlaceholders(draft)
    expect(result.presentation).toBe("X e X e X")
  })

  it("does not throw when optional fields are undefined", () => {
    const draft = makeDraft({ name: "Bot" })
    // response_examples is present by default, set all fields to undefined-ish via empty strings
    // We test that fallback_policy undefined doesn't throw
    const draftNoFallback = {
      ...draft,
      fallback_policy: undefined as unknown as typeof draft.fallback_policy,
      response_examples: undefined as unknown as typeof draft.response_examples,
      knowledge_base: undefined as unknown as typeof draft.knowledge_base,
      behavior: undefined as unknown as typeof draft.behavior,
    }
    expect(() => substituteAgentPlaceholders(draftNoFallback)).not.toThrow()
  })

  it("performance: 1000 placeholders substituted in < 50ms", () => {
    const segment = "{agent.name} ativa {company.name}. "
    const longText = segment.repeat(500) // 1000 placeholders
    const draft = makeDraft({
      name: "Agente",
      company_info: { ...makeDraft().company_info, name: "Empresa" },
      presentation: longText,
    })
    const start = performance.now()
    const result = substituteAgentPlaceholders(draft)
    const duration = performance.now() - start
    expect(result.presentation).toContain("Agente ativa Empresa.")
    expect(duration).toBeLessThan(50)
  })
})
