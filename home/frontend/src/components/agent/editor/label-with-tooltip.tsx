import { IconInfoCircle } from "@tabler/icons-react"
import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface LabelWithTooltipProps {
  htmlFor?: string
  children: ReactNode
  tooltip: ReactNode
  className?: string
  required?: boolean
}

export function LabelWithTooltip({
  htmlFor,
  children,
  tooltip,
  className,
  required,
}: LabelWithTooltipProps) {
  const tooltipID = htmlFor ? `${htmlFor}-tooltip` : undefined
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs">
        {children}
        {required && (
          <span aria-label="obrigatório" className="text-destructive ml-0.5">
            *
          </span>
        )}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Ver explicação"
            aria-describedby={tooltipID}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-4 w-4 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <IconInfoCircle className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent id={tooltipID} className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
