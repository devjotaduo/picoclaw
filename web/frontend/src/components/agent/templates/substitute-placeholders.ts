import type { TemplateApplyPayload } from "./types"

// Replaces the `{agent.name}` and `{company.name}` placeholders used in the
// template catalog with the values the admin actually picked before the
// template is applied or an existing config is shown back in the editor.
// Substitution runs on free-form template text that may reference the chosen
// agent/company. The source fields themselves (name/company_info.name) are
// intentionally left alone so editing them later does not break replacement.
function applyReplacements(
  input: string,
  agent: string,
  company: string,
): string {
  if (!input) return input
  let out = input
  if (agent.trim() !== "") {
    out = out.replaceAll("{agent.name}", agent)
  }
  if (company.trim() !== "") {
    out = out.replaceAll("{company.name}", company)
  }
  return out
}

export function substituteAgentPlaceholders(
  draft: TemplateApplyPayload,
): TemplateApplyPayload {
  const agent = draft.name ?? ""
  const company = draft.company_info?.name ?? ""
  if (agent.trim() === "" && company.trim() === "") {
    return draft
  }
  const sub = (s: string | undefined) =>
    applyReplacements(s ?? "", agent, company)

  return {
    ...draft,
    presentation: sub(draft.presentation),
    short_description: sub(draft.short_description),
    personality: (draft.personality ?? []).map(sub),
    values: (draft.values ?? []).map(sub),
    functions: (draft.functions ?? []).map(sub),
    prohibitions: (draft.prohibitions ?? []).map(sub),
    protections: (draft.protections ?? []).map(sub),
    conversation_flow: (draft.conversation_flow ?? []).map(sub),
    response_examples: draft.response_examples
      ? {
          greeting: sub(draft.response_examples.greeting),
          clarification: sub(draft.response_examples.clarification),
          unknown_answer: sub(draft.response_examples.unknown_answer),
          routing: sub(draft.response_examples.routing),
          closing: sub(draft.response_examples.closing),
        }
      : draft.response_examples,
    knowledge_base: draft.knowledge_base
      ? {
          overview: sub(draft.knowledge_base.overview),
          faqs: (draft.knowledge_base.faqs ?? []).map((faq) => ({
            question: sub(faq.question),
            answer: sub(faq.answer),
          })),
        }
      : draft.knowledge_base,
    style_guide: draft.style_guide
      ? {
          ...draft.style_guide,
          do: (draft.style_guide.do ?? []).map(sub),
          dont: (draft.style_guide.dont ?? []).map(sub),
        }
      : draft.style_guide,
    fallback_policy: draft.fallback_policy
      ? {
          ...draft.fallback_policy,
          when_unsure: sub(draft.fallback_policy.when_unsure),
          route_message: sub(draft.fallback_policy.route_message),
          when_to_route: (draft.fallback_policy.when_to_route ?? []).map(sub),
        }
      : draft.fallback_policy,
    knowledge_policy: (draft.knowledge_policy ?? []).map(sub),
    security_rules: (draft.security_rules ?? []).map(sub),
    quality_metrics: (draft.quality_metrics ?? []).map(sub),
    approval_required_for: (draft.approval_required_for ?? []).map(sub),
    professionals: (draft.professionals ?? []).map((professional) => ({
      ...professional,
      name: sub(professional.name),
      role: sub(professional.role),
      bio: sub(professional.bio),
      services: (professional.services ?? []).map((service) => ({
        ...service,
        name: sub(service.name),
        details: sub(service.details),
        duration: sub(service.duration),
        price: sub(service.price),
      })),
    })),
    products: (draft.products ?? []).map((product) => ({
      ...product,
      name: sub(product.name),
      details: sub(product.details),
      price: sub(product.price),
    })),
    behavior: draft.behavior
      ? {
          ...draft.behavior,
          out_of_hours_reply: sub(draft.behavior.out_of_hours_reply),
        }
      : draft.behavior,
  }
}
