import { IconCheck } from "@tabler/icons-react"

import type { AgentTemplate } from "@/components/agent/templates/types"
import { cn } from "@/lib/utils"

import { iconComponentFor } from "./icon-picker"

export interface AgentTemplateGalleryProps {
  templates: readonly AgentTemplate[]
  selectedID?: string
  onSelect: (id: string) => void
  /** Whether to render in compact (2-col) mode for embedded wizard usage. */
  compact?: boolean
}

export function AgentTemplateGallery({
  templates,
  selectedID,
  onSelect,
  compact = false,
}: AgentTemplateGalleryProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Galeria de templates"
      className={cn(
        "grid gap-3",
        compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {templates.map((tmpl) => {
        const active = tmpl.id === selectedID
        const Icon = iconComponentFor(tmpl.icon)
        return (
          <button
            key={tmpl.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-describedby={`tmpl-${tmpl.id}-desc`}
            onClick={() => onSelect(tmpl.id)}
            className={cn(
              "border-border/60 bg-card focus-visible:ring-ring focus-visible:ring-offset-background hover:border-foreground/30 flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              active && "border-primary bg-primary/5 ring-primary/30 ring-2",
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <div className="bg-muted/60 flex size-8 shrink-0 items-center justify-center rounded-lg">
                {Icon ? (
                  <Icon
                    className="text-muted-foreground size-4"
                    aria-hidden="true"
                  />
                ) : (
                  <span aria-hidden="true">·</span>
                )}
              </div>
              {active && (
                <IconCheck className="text-primary size-4" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{tmpl.name}</h3>
              <p
                id={`tmpl-${tmpl.id}-desc`}
                className="text-muted-foreground line-clamp-3 text-xs leading-relaxed"
              >
                {tmpl.short_description}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {tmpl.recommended_skills.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]"
                >
                  {skill}
                </span>
              ))}
              {tmpl.recommended_skills.length > 3 && (
                <span className="text-muted-foreground text-[10px]">
                  +{tmpl.recommended_skills.length - 3}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
