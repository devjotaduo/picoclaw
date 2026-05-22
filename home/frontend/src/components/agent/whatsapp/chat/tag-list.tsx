import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { dedupeTags } from "@/lib/whatsapp/dedupe-tags"

export interface TagListProps {
  tags: readonly string[] | null | undefined
  /** Max visible tags before collapsing into a "+N" pill. Default 3. */
  limit?: number
  className?: string
}

/**
 * Renders a list of tags with case-insensitive deduplication and a "+N"
 * overflow pill that lists the hidden tags in a tooltip.
 *
 * Regression covered: "duvida_geral" used to render twice when the same tag
 * was returned by both `profile.tags` and `insight.collected_fields`.
 */
export function TagList({ tags, limit = 3, className = "" }: TagListProps) {
  const { visible, overflow, total } = dedupeTags(tags, limit)
  if (total === 0) return null
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className}`}
      role="list"
      aria-label={`Tags (${total})`}
    >
      {visible.map((tag) => (
        <span
          key={tag}
          role="listitem"
          className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium"
        >
          {tag}
        </span>
      ))}
      {overflow.length > 0 && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <span
              className="text-muted-foreground bg-muted ring-border/60 cursor-default rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
              tabIndex={0}
              aria-label={`Mais ${overflow.length} tags: ${overflow.join(", ")}`}
            >
              +{overflow.length}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-[11px]">
            {overflow.join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}
