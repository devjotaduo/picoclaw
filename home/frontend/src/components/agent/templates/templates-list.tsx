import { IconSearch } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"

import { getCategoryLabel } from "./category-utils"
import { TemplateCard } from "./template-card"
import type {
  AgentTemplate,
  TemplateCategory,
  TemplateLayoutMode,
} from "./types"

export interface TemplateGroupSection {
  category: TemplateCategory
  templates: AgentTemplate[]
}

interface TemplatesListProps {
  sortedTemplates: AgentTemplate[]
  groupedTemplates: TemplateGroupSection[]
  layoutMode: TemplateLayoutMode
  categoryFilter: string
  hasActiveFilters: boolean
  activeTemplateId: string | null
  onUseTemplate: (template: AgentTemplate) => void
}

export function TemplatesList({
  sortedTemplates,
  groupedTemplates,
  layoutMode,
  categoryFilter,
  hasActiveFilters,
  activeTemplateId,
  onUseTemplate,
}: TemplatesListProps) {
  const { t } = useTranslation()

  if (!sortedTemplates.length) {
    return (
      <div className="border-border/40 bg-muted/5 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center shadow-sm">
        <div className="bg-muted mb-2 rounded-full p-4">
          <IconSearch className="text-muted-foreground size-6" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">
          {hasActiveFilters
            ? t("pages.agent.templates.no_results")
            : t("pages.agent.templates.empty")}
        </h3>
      </div>
    )
  }

  if (layoutMode === "grouped" && categoryFilter === "all") {
    return (
      <div className="space-y-6">
        {groupedTemplates.map((section) => (
          <div key={section.category} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="bg-muted/40 text-muted-foreground ring-border/40 inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase ring-1 ring-inset">
                {getCategoryLabel(section.category, t)}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {section.templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isActive={template.id === activeTemplateId}
                  onUse={() => onUseTemplate(template)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sortedTemplates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          isActive={template.id === activeTemplateId}
          onUse={() => onUseTemplate(template)}
        />
      ))}
    </div>
  )
}
