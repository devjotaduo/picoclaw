/**
 * RailCard — seção recolhível do right rail. Header com ícone + título +
 * badge de contagem + chevron; corpo rolável. Refined-minimalism: hairlines,
 * sem sombra, um acento só.
 */
import { IconChevronDown } from "@tabler/icons-react"
import * as React from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface RailCardProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  count?: number
  /** Acento âmbar no badge quando há itens "quentes" (não-lidos, urgentes). */
  highlight?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}

export function RailCard({
  icon: Icon,
  title,
  count,
  highlight,
  defaultOpen = true,
  children,
}: RailCardProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-border/50 border-b last:border-b-0"
    >
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground group/rail flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors">
        <Icon className="size-4 opacity-70" />
        <span className="text-foreground/90 text-[12.5px] font-medium tracking-tight">
          {title}
        </span>
        {typeof count === "number" && count > 0 ? (
          <span
            className={cn(
              "ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
              highlight
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
        <IconChevronDown
          className={cn(
            "ml-auto size-3.5 opacity-50 transition-transform",
            !open && "-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function RailEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground/60 px-3 py-4 text-center text-[11px] leading-5">
      {children}
    </p>
  )
}
