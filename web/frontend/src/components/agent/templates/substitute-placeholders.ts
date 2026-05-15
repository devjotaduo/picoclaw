import type { TemplateApplyPayload } from "./types"

// Replaces the `{agent.name}` and `{company.name}` placeholders used in the
// template catalog with the values the admin actually picked. We do this in
// two spots:
//
//   1. When a template is first loaded into the editor (templateToDraft).
//   2. When an already-applied agent config is loaded back from disk.
//
// Either way, the user sees the rendered presentation instead of literal
// `{agent.name}` text. Substitution only runs on free-form text fields the
// customer would see — name/company_info.name are intentionally left alone
// so editing them later doesn't break the substitution source.
function applyReplacements(input: string, agent: string, company: string): string {
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
    fallback_policy: draft.fallback_policy
      ? {
          ...draft.fallback_policy,
          when_unsure: sub(draft.fallback_policy.when_unsure),
          route_message: sub(draft.fallback_policy.route_message),
          when_to_route: (draft.fallback_policy.when_to_route ?? []).map(sub),
        }
      : draft.fallback_policy,
    behavior: draft.behavior
      ? {
          ...draft.behavior,
          out_of_hours_reply: sub(draft.behavior.out_of_hours_reply),
        }
      : draft.behavior,
  }
}
