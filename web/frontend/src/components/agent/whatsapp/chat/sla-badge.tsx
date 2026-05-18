import { IconAlertTriangle, IconClock } from "@tabler/icons-react"

import { type SLAStatus } from "@/lib/whatsapp/sla"

export interface SLABadgeProps {
  status: SLAStatus | null
  className?: string
}

export function SLABadge({ status, className = "" }: SLABadgeProps) {
  if (!status) return null
  const tone =
    status.level === "breach"
      ? "bg-destructive/15 text-destructive ring-destructive/30"
      : status.level === "warning"
        ? "bg-amber-100 text-amber-700 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-700"
        : "bg-muted text-foreground/70 ring-border"
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${tone} ${className}`}
      role="status"
      aria-label={`Aguardando resposta há ${status.label}`}
      title={`Aguardando resposta há ${status.label}`}
    >
      {status.level === "breach" ? (
        <IconAlertTriangle className="size-2.5" aria-hidden="true" />
      ) : (
        <IconClock className="size-2.5" aria-hidden="true" />
      )}
      SLA {status.label}
    </span>
  )
}
