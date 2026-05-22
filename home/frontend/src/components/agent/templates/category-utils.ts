import type { TFunction } from "i18next"

import type { AgentTemplate, TemplateCategory } from "./types"

const CATEGORY_ORDER: Record<TemplateCategory, number> = {
  customer_service: 0,
  sales: 1,
  support: 2,
  internal: 3,
}

export function getCategoryLabel(
  category: TemplateCategory | "all",
  t: TFunction,
): string {
  return t(`pages.agent.templates.categories.${category}`)
}

export function sortCategories(
  categories: TemplateCategory[],
): TemplateCategory[] {
  return [...categories].sort(
    (a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99),
  )
}

export function compareTemplates(
  left: AgentTemplate,
  right: AgentTemplate,
): number {
  const byCategory =
    (CATEGORY_ORDER[left.category] ?? 99) -
    (CATEGORY_ORDER[right.category] ?? 99)
  if (byCategory !== 0) return byCategory
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
}
