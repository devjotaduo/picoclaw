"use client"

import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react"

import { cn } from "@/lib/utils"

export type ConversationProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children?: ReactNode
}

export const Conversation = forwardRef(function Conversation(
  { children, className, ...props }: ConversationProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})

export type ConversationContentProps = HTMLAttributes<HTMLDivElement>

export function ConversationContent({
  children,
  className,
  ...props
}: ConversationContentProps) {
  return (
    <div
      className={cn("mx-auto flex w-full flex-col gap-8", className)}
      {...props}
    >
      {children}
    </div>
  )
}
