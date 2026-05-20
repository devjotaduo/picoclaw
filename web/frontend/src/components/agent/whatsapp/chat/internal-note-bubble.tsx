import { IconNotes, IconTrash } from "@tabler/icons-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { InternalNote } from "@/lib/whatsapp/internal-notes"

export interface InternalNoteBubbleProps {
  note: InternalNote
  onRemove?: (id: string) => void
}

function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}

/**
 * Yellow "post-it" bubble for internal notes. Renders centered so it visually
 * separates from contact/agent bubbles. Visible only on this dashboard — the
 * contact never receives it.
 */
export function InternalNoteBubble({
  note,
  onRemove,
}: InternalNoteBubbleProps) {
  return (
    <div
      className="flex justify-center"
      data-testid="internal-note-bubble"
      data-note-id={note.id}
    >
      <div className="max-w-[80%] rounded-2xl bg-amber-100/80 px-3 py-2 text-amber-950 shadow-xs ring-1 ring-amber-300/60 dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-700/40">
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
          <IconNotes className="size-3" aria-hidden="true" />
          Nota interna · {note.author}
        </div>
        <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {note.content}
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 text-[9px] text-amber-700/80 tabular-nums dark:text-amber-300/70">
          <time dateTime={new Date(note.ts).toISOString()}>
            {formatClock(note.ts)}
          </time>
          {onRemove && (
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onRemove(note.id)}
                  className="hover:text-destructive focus-visible:ring-ring rounded-md p-0.5 text-amber-700/70 focus-visible:ring-2 focus-visible:outline-none dark:text-amber-300/70"
                  aria-label="Remover nota"
                >
                  <IconTrash className="size-3" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Remover</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}
