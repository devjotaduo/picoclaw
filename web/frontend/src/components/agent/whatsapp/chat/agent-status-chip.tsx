import { IconHandStop, IconRobot } from "@tabler/icons-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface AgentStatusChipProps {
  paused: boolean
  /** True when the pause is the result of automatic typing detection. */
  autoPaused?: boolean
  /** Click handler for the "Retomar" affordance when paused. */
  onResume?: () => void
  className?: string
}

/**
 * Replaces the old amber banner over the composer with a discrete chip that
 * sits next to the agent toggle. Shows the agent is paused vs. active, and
 * exposes a one-click "Retomar" when paused.
 */
export function AgentStatusChip({
  paused,
  autoPaused = false,
  onResume,
  className = "",
}: AgentStatusChipProps) {
  if (!paused) {
    return (
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <span
            className={`text-muted-foreground inline-flex items-center gap-1 text-[11px] font-medium ${className}`}
            role="status"
          >
            <IconRobot className="size-3.5" aria-hidden="true" />
            Agente ativo
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">
          O agente responde automaticamente. Comece a digitar para pausá-lo.
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 ${className}`}
      role="status"
    >
      <IconHandStop className="size-3" aria-hidden="true" />
      {autoPaused ? "Pausado automaticamente" : "Pausado"}
      {onResume && (
        <button
          type="button"
          onClick={onResume}
          className="ml-1 cursor-pointer rounded px-1 text-[10px] underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
          aria-label="Retomar agente"
        >
          Retomar
        </button>
      )}
    </span>
  )
}
