"use client"

import { cjk } from "@streamdown/cjk"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import { mermaid } from "@streamdown/mermaid"
import { type ComponentProps, type HTMLAttributes, memo } from "react"
import { Streamdown } from "streamdown"

import { cn } from "@/lib/utils"

type VisualMessageRole = "system" | "user" | "assistant" | "data"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: VisualMessageRole
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "group flex w-full max-w-[92%] flex-col gap-2",
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
        "max-w-full min-w-0 overflow-hidden rounded-xl text-sm",
        "group-[.is-user]:bg-[#111110] group-[.is-user]:text-[#f3f2ec]",
        "group-[.is-assistant]:text-[#f2f1ea]",
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
        "[&_a]:text-[#d6b48a] [&_a]:underline-offset-4 [&_a:hover]:underline",
        "[&_code]:rounded-md [&_code]:border [&_code]:border-white/10 [&_code]:bg-white/[0.07] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[#f4efe6]",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-[#10100f] [&_pre]:p-3",
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
