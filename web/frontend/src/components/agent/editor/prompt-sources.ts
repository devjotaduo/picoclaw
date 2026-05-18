import type { TemplateApplyPayload } from "@/components/agent/templates/types"

export type PromptSource =
  | "profile"
  | "role"
  | "skills"
  | "context"
  | "meta"

export interface PromptSection {
  key: string
  label: string
  source: PromptSource
  preview: string
}

const SOURCE_LABELS: Record<PromptSource, string> = {
  profile: "Perfil",
  role: "Papel",
  skills: "Skills",
  context: "Contexto",
  meta: "Meta",
}

function clip(value: unknown, max = 120): string {
  const str =
    typeof value === "string" ? value : JSON.stringify(value ?? "")
  return str.length > max ? `${str.slice(0, max)}…` : str
}

export function describePayloadSources(
  payload: TemplateApplyPayload,
): PromptSection[] {
  const sections: PromptSection[] = []

  if (payload.name) {
    sections.push({
      key: "name",
      label: `${SOURCE_LABELS.profile}: nome`,
      source: "profile",
      preview: payload.name,
    })
  }
  if (payload.tone) {
    sections.push({
      key: "tone",
      label: `${SOURCE_LABELS.profile}: tom`,
      source: "profile",
      preview: String(payload.tone),
    })
  }
  if (payload.language) {
    sections.push({
      key: "language",
      label: `${SOURCE_LABELS.profile}: idioma`,
      source: "profile",
      preview: String(payload.language),
    })
  }
  if (payload.presentation) {
    sections.push({
      key: "presentation",
      label: `${SOURCE_LABELS.role}: contrato`,
      source: "role",
      preview: clip(payload.presentation),
    })
  }
  if (payload.functions?.length) {
    sections.push({
      key: "functions",
      label: `${SOURCE_LABELS.role}: funções (${payload.functions.length})`,
      source: "role",
      preview: clip(payload.functions.join(" · ")),
    })
  }
  if (payload.prohibitions?.length) {
    sections.push({
      key: "prohibitions",
      label: `${SOURCE_LABELS.role}: limites (${payload.prohibitions.length})`,
      source: "role",
      preview: clip(payload.prohibitions.join(" · ")),
    })
  }
  const skillCount =
    payload.skill_configs?.filter((s) => s.enabled).length ?? 0
  if (skillCount > 0) {
    sections.push({
      key: "skills",
      label: `${SOURCE_LABELS.skills}: ${skillCount} ativa(s)`,
      source: "skills",
      preview: clip(
        (payload.skill_configs ?? [])
          .filter((s) => s.enabled)
          .map((s) => s.name)
          .join(", "),
      ),
    })
  }
  if (payload.company_info?.name) {
    sections.push({
      key: "company",
      label: `${SOURCE_LABELS.context}: empresa`,
      source: "context",
      preview: clip(payload.company_info.name),
    })
  }
  if (payload.modules?.professionals_enabled) {
    sections.push({
      key: "professionals",
      label: `${SOURCE_LABELS.context}: profissionais`,
      source: "context",
      preview: `${payload.professionals?.length ?? 0} cadastrados`,
    })
  }
  if (payload.modules?.products_enabled) {
    sections.push({
      key: "products",
      label: `${SOURCE_LABELS.context}: produtos`,
      source: "context",
      preview: `${payload.products?.length ?? 0} cadastrados`,
    })
  }
  if (payload.template_id) {
    sections.push({
      key: "template",
      label: `${SOURCE_LABELS.meta}: template`,
      source: "meta",
      preview: payload.template_id,
    })
  }
  if (payload.model) {
    sections.push({
      key: "model",
      label: `${SOURCE_LABELS.meta}: modelo`,
      source: "meta",
      preview: payload.model,
    })
  }

  return sections
}
