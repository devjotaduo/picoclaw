import { IconLayoutSidebar } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"

import { getLauncherPolicy } from "@/api/launcher-policy"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useUIVisibility } from "@/hooks/use-ui-visibility"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  titleExtra?: ReactNode
  children?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  titleExtra,
  children,
  className,
}: PageHeaderProps) {
  const launcherPolicyQ = useQuery({
    queryKey: ["launcher-policy"],
    queryFn: getLauncherPolicy,
    staleTime: 30_000,
  })
  const { visible: isVisible } = useUIVisibility(launcherPolicyQ.data)
  const { state, toggleSidebar } = useSidebar()
  const sidebarLabel =
    state === "expanded" ? "Colapsar sidebar" : "Expandir sidebar"
  const showSidebarTrigger = isVisible("layout.sidebar_trigger")

  return (
    <div
      className={cn(
        "z-40 flex h-14 shrink-0 items-center justify-between px-6 pt-2",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {showSidebarTrigger ? (
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={sidebarLabel}
                onClick={toggleSidebar}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-9 items-center justify-center rounded-lg [&>svg]:size-5"
              >
                <IconLayoutSidebar />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarLabel}</TooltipContent>
          </Tooltip>
        ) : null}
        {title ? (
          <h2 className="text-foreground/90 text-xl font-medium tracking-tight">
            {title}
          </h2>
        ) : null}
        {titleExtra}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
