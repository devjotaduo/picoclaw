"use client"

import { cjk } from "@streamdown/cjk"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import { mermaid } from "@streamdown/mermaid"
import type { UIMessage } from "ai"
import { memo, type ComponentProps, type HTMLAttributes } from "react"
import { Streamdown } from "streamdown"

import { cn } from "@/lib/utils"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full max-w-[95%] flex-col gap-2",
        from === "user" ? "is-user ml-auto items-end" : "is-assistant",
        className,
      )}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export function MessageContent({
  children,
  className,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-xl border text-sm",
        "group-[.is-user]:border-emerald-400/20 group-[.is-user]:bg-emerald-500/10 group-[.is-user]:text-emerald-50",
        "group-[.is-assistant]:border-border/60 group-[.is-assistant]:bg-card group-[.is-assistant]:text-card-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>

const streamdownPlugins = { cjk, code, math, mermaid }

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [overflow-wrap:anywhere] break-words",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_a]:text-amber-300 [&_a]:underline-offset-4 [&_a:hover]:underline",
        "[&_code]:rounded-md [&_code]:border [&_code]:border-border/60 [&_code]:bg-muted/60 [&_code]:px-1.5 [&_code]:py-0.5",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-zinc-950 [&_pre]:p-3",
        "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.isAnimating === nextProps.isAnimating,
)

MessageResponse.displayName = "MessageResponse"
