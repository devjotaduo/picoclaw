"use client"

import { useCallback, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SuggestionsProps = ComponentProps<"div">

export function Suggestions({
  className,
  children,
  ...props
}: SuggestionsProps) {
  return (
    <div
      className={cn("flex w-full flex-col gap-1.5 overflow-hidden", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export type SuggestionProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  suggestion: string
  onClick?: (suggestion: string) => void
}

export function Suggestion({
  suggestion,
  onClick,
  className,
  variant = "ghost",
  size = "default",
  children,
  ...props
}: SuggestionProps) {
  const handleClick = useCallback(() => {
    onClick?.(suggestion)
  }, [onClick, suggestion])

  return (
    <Button
      className={cn("h-auto cursor-pointer rounded-lg", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  )
}
