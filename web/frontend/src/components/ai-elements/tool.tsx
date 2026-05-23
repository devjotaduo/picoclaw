"use client"

import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconTerminal2,
} from "@tabler/icons-react"
import { type ComponentProps, type ReactNode } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "pending"
  | "running"
  | "completed"
  | "error"

function statusLabel(state: ToolState) {
  switch (state) {
    case "input-streaming":
    case "pending":
      return "Pendente"
    case "input-available":
    case "running":
      return "Executando"
    case "output-error":
    case "error":
      return "Erro"
    default:
      return "Concluído"
  }
}

function StatusIcon({ state }: { state: ToolState }) {
  if (state === "output-error" || state === "error") {
    return <IconAlertTriangle className="size-4 text-red-300" />
  }
  if (state === "input-available" || state === "running") {
    return <IconLoader2 className="size-4 animate-spin text-amber-300" />
  }
  if (state === "output-available" || state === "completed") {
    return <IconCheck className="size-4 text-emerald-300" />
  }
  return <IconTerminal2 className="text-muted-foreground size-4" />
}

export function Tool({
  children,
  className,
  defaultOpen = false,
  ...props
}: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn(
        "group/tool border-border/50 bg-card/70 text-card-foreground overflow-hidden rounded-xl border",
        className,
      )}
      {...props}
    >
      {children}
    </Collapsible>
  )
}

type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  state: ToolState
  title?: string
  toolName?: string
  type?: string
}

export function ToolHeader({
  className,
  state,
  title,
  toolName,
  type,
  ...props
}: ToolHeaderProps) {
  const label = title || toolName || type || "Ferramenta"

  return (
    <CollapsibleTrigger
      className={cn(
        "hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors outline-none",
        className,
      )}
      {...props}
    >
      <StatusIcon state={state} />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="border-border/60 bg-muted/40 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
        {statusLabel(state)}
      </span>
      <IconChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]/tool:rotate-180" />
    </CollapsibleTrigger>
  )
}

export function ToolContent({
  children,
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn("border-border/40 border-t px-3 py-3", className)}
      {...props}
    >
      {children}
    </CollapsibleContent>
  )
}

export function ToolInput({
  input,
  className,
  ...props
}: ComponentProps<"div"> & { input?: unknown }) {
  if (input === undefined || input === null || input === "") {
    return null
  }

  const value =
    typeof input === "string" ? input : JSON.stringify(input, null, 2)

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <div className="text-muted-foreground text-xs font-medium">
        Parâmetros
      </div>
      <pre className="bg-muted/40 text-muted-foreground border-border/50 overflow-x-auto rounded-lg border p-2 text-xs">
        {value}
      </pre>
    </div>
  )
}

export function ToolOutput({
  output,
  errorText,
  className,
  ...props
}: ComponentProps<"div"> & {
  output?: ReactNode
  errorText?: string
}) {
  if (!output && !errorText) {
    return null
  }

  return (
    <div className={cn("mt-3 space-y-1.5", className)} {...props}>
      <div className="text-muted-foreground text-xs font-medium">Resultado</div>
      <div
        className={cn(
          "rounded-lg border p-2 text-sm",
          errorText
            ? "border-red-500/30 bg-red-500/10 text-red-100"
            : "border-border/50 bg-muted/30 text-muted-foreground",
        )}
      >
        {errorText || output}
      </div>
    </div>
  )
}
