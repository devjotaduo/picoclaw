"use client"

import { IconChevronDown, IconExternalLink } from "@tabler/icons-react"
import { type AnchorHTMLAttributes, type HTMLAttributes } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export function Sources({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <Collapsible
      defaultOpen={false}
      className={cn(
        "group/sources border-border/50 bg-card/70 overflow-hidden rounded-xl border",
        className,
      )}
      {...props}
    >
      {children}
    </Collapsible>
  )
}

export function SourcesTrigger({
  count,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { count: number }) {
  return (
    <CollapsibleTrigger
      className={cn(
        "text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors outline-none",
        className,
      )}
      {...props}
    >
      <IconExternalLink className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {count === 1 ? "1 fonte" : `${count} fontes`}
      </span>
      <IconChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/sources:rotate-180" />
    </CollapsibleTrigger>
  )
}

export function SourcesContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <CollapsibleContent
      className={cn(
        "border-border/40 grid gap-1 border-t px-2 py-2",
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  )
}

export function Source({
  children,
  className,
  href,
  title,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "hover:bg-muted/50 text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
        className,
      )}
      {...props}
    >
      <IconExternalLink className="size-3.5 shrink-0" />
      <span className="truncate">{children || title || href}</span>
    </a>
  )
}
