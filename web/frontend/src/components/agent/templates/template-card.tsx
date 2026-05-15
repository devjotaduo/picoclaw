import {
  IconArrowRight,
  IconCalendarStats,
  IconCheck,
  IconPackage,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { getCategoryLabel } from "./category-utils"
import { TemplateIcon } from "./template-icon"
import type { AgentTemplate } from "./types"

interface TemplateCardProps {
  template: AgentTemplate
  isActive?: boolean
  onUse: () => void
}

export function TemplateCard({
  template,
  isActive = false,
  onUse,
}: TemplateCardProps) {
  const { t } = useTranslation()

  return (
    <Card
      className={cn(
        "group border-border/40 bg-card/40 hover:bg-card hover:border-border/80 relative overflow-hidden transition-all hover:shadow-md",
        isActive &&
          "border-primary/60 ring-primary/30 bg-primary/5 ring-2 ring-inset hover:border-primary/60",
      )}
      size="sm"
    >
      <div className="via-primary/10 absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="bg-primary/10 ring-primary/20 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl ring-1">
              <TemplateIcon name={template.icon} className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold tracking-tight">
                  {template.name}
                </CardTitle>
                <span className="bg-muted/60 text-muted-foreground ring-border/50 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset">
                  {getCategoryLabel(template.category, t)}
                </span>
                {isActive ? (
                  <span className="text-primary inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ring-1 ring-primary/30 ring-inset">
                    <IconCheck className="size-3" />
                    {t("pages.agent.templates.card_badges.active", "Active")}
                  </span>
                ) : null}
                {template.modules.professionals_enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-sky-700 uppercase ring-1 ring-sky-500/20 ring-inset dark:text-sky-400">
                    <IconCalendarStats className="size-3" />
                    {t("pages.agent.templates.card_badges.appointment")}
                  </span>
                ) : null}
                {template.modules.products_enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-700 uppercase ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400">
                    <IconPackage className="size-3" />
                    {t("pages.agent.templates.card_badges.catalog")}
                  </span>
                ) : null}
              </div>
              <CardDescription className="line-clamp-2 text-sm leading-relaxed">
                {template.short_description}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <Button
              size="sm"
              variant="default"
              className="shadow-sm transition-all"
              onClick={onUse}
            >
              {t("pages.agent.templates.use_template")}
              <IconArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            <span className="font-semibold tracking-wide uppercase opacity-70">
              {t("pages.agent.templates.card.functions_count")}:
            </span>{" "}
            {template.functions.length}
          </span>
          <span>
            <span className="font-semibold tracking-wide uppercase opacity-70">
              {t("pages.agent.templates.card.prohibitions_count")}:
            </span>{" "}
            {template.prohibitions.length}
          </span>
          <span>
            <span className="font-semibold tracking-wide uppercase opacity-70">
              {t("pages.agent.templates.card.protections_count")}:
            </span>{" "}
            {template.protections.length}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
