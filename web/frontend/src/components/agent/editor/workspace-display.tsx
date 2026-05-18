import { IconFolder } from "@tabler/icons-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { workspaceFriendlyName } from "./workspace-format"

export interface WorkspaceDisplayProps {
  workspace: string
  isDefault?: boolean
  className?: string
}

export function WorkspaceDisplay({
  workspace,
  isDefault,
  className,
}: WorkspaceDisplayProps) {
  const label = workspaceFriendlyName(workspace, isDefault)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "border-border/60 bg-muted/40 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
            className,
          )}
        >
          <IconFolder
            className="text-muted-foreground size-3.5"
            aria-hidden="true"
          />
          <span className="font-medium">Workspace: {label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <p className="text-xs">
          O workspace é a pasta isolada onde o agente guarda prompts, skills
          e dados de sessão. Cada agente roda em um workspace separado.
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
