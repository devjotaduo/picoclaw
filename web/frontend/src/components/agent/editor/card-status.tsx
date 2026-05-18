import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconCircleDashed,
} from "@tabler/icons-react"
import type { ComponentType, SVGProps } from "react"

import { cn } from "@/lib/utils"

export type CardStatus = "empty" | "partial" | "complete" | "error"

export interface CardStatusBadgeProps {
  status: CardStatus
  partialOf?: { current: number; total: number }
  errorMessage?: string
  className?: string
}

const STATUS_ICON: Record<
  CardStatus,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  empty: IconCircleDashed,
  partial: IconAlertTriangle,
  complete: IconCheck,
  error: IconAlertCircle,
}

const STATUS_TEXT: Record<CardStatus, string> = {
  empty: "Não configurado",
  partial: "Parcial",
  complete: "Completo",
  error: "Com erro",
}

const STATUS_CLASS: Record<CardStatus, string> = {
  empty: "editor-status-empty",
  partial: "editor-status-partial",
  complete: "editor-status-complete",
  error: "editor-status-error",
}

export function CardStatusBadge({
  status,
  partialOf,
  errorMessage,
  className,
}: CardStatusBadgeProps) {
  const Icon = STATUS_ICON[status]
  let label: string = STATUS_TEXT[status]
  if (status === "partial" && partialOf) {
    label = `${partialOf.current} de ${partialOf.total} campos`
  }
  if (status === "error" && errorMessage) {
    label = errorMessage
  }
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_CLASS[status],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
