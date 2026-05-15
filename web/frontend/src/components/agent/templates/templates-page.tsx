import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/page-header"

import { FilterBar } from "./filter-bar"
import { TemplateConfigSheet } from "./template-config-sheet"
import { TemplatesList } from "./templates-list"
import { useTemplatesPage } from "./use-templates-page"

export function TemplatesPage() {
  const { t } = useTranslation()
  const {
    searchQuery,
    categoryFilter,
    layoutMode,
    selectedTemplate,
    draft,
    installedSkills,
    activeTemplateId,
    availableCategories,
    sortedTemplates,
    groupedTemplates,
    hasActiveFilters,
    isApplying,
    setSearchQuery,
    setCategoryFilter,
    setLayoutMode,
    setDraft,
    handleUseTemplate,
    handleDrawerOpenChange,
    handleApply,
  } = useTemplatesPage()

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.templates")} />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="w-full max-w-6xl space-y-8">
          <section className="animate-in fade-in space-y-3 duration-300 md:duration-500">
            <div className="space-y-2">
              <h2 className="text-foreground text-lg font-semibold tracking-tight">
                {t("pages.agent.templates.title")}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t("pages.agent.templates.subtitle")}
              </p>
            </div>

            <div className="flex flex-col gap-4 py-3">
              <FilterBar
                searchQuery={searchQuery}
                categoryFilter={categoryFilter}
                availableCategories={availableCategories}
                layoutMode={layoutMode}
                onSearchQueryChange={setSearchQuery}
                onCategoryFilterChange={setCategoryFilter}
                onLayoutModeChange={setLayoutMode}
              />
            </div>

            <TemplatesList
              sortedTemplates={sortedTemplates}
              groupedTemplates={groupedTemplates}
              layoutMode={layoutMode}
              categoryFilter={categoryFilter}
              hasActiveFilters={hasActiveFilters}
              activeTemplateId={activeTemplateId}
              onUseTemplate={handleUseTemplate}
            />
          </section>
        </div>
      </div>

      <TemplateConfigSheet
        open={selectedTemplate !== null}
        template={selectedTemplate}
        draft={draft}
        isApplying={isApplying}
        installedSkills={installedSkills}
        onDraftChange={setDraft}
        onApply={handleApply}
        onOpenChange={handleDrawerOpenChange}
      />
    </div>
  )
}
