"use client"

import { IconChevronDown, IconLoader2 } from "@tabler/icons-react"
import { type ComponentProps, type ReactNode } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean
}

export function Reasoning({
  children,
  className,
  defaultOpen = true,
  isStreaming = false,
  ...props
}: ReasoningProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn(
        "group/reasoning text-muted-foreground rounded-lg",
        className,
      )}
      data-streaming={isStreaming ? "true" : "false"}
      {...props}
    >
      {children}
    </Collapsible>
  )
}

type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode
  isStreaming?: boolean
  duration?: number
}

export function ReasoningTrigger({
  children,
  className,
  duration,
  getThinkingMessage,
  isStreaming = false,
  ...props
}: ReasoningTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "hover:text-foreground flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm transition-colors outline-none",
        className,
      )}
      {...props}
    >
      {isStreaming ? (
        <IconLoader2 className="size-4 shrink-0 animate-spin opacity-80" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        {children ??
          getThinkingMessage?.(isStreaming, duration) ??
          (isStreaming ? "Pensando" : "Pensamento")}
      </span>
      <IconChevronDown className="size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]/reasoning:rotate-180" />
    </CollapsibleTrigger>
  )
}

export function ReasoningContent({
  children,
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn("px-1 pb-1 text-sm leading-relaxed opacity-80", className)}
      {...props}
    >
      {children}
    </CollapsibleContent>
  )
}
