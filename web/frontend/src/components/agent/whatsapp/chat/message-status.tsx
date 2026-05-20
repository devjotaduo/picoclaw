import {
  IconAlertCircle,
  IconCheck,
  IconChecks,
  IconClock,
} from "@tabler/icons-react"

import type { WhatsAppMessageStatus } from "@/api/whatsapp"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const LABEL: Record<WhatsAppMessageStatus | "error", string> = {
  pending: "Enviando…",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
  error: "Falha no envio",
}

export interface MessageStatusProps {
  status: WhatsAppMessageStatus | null | undefined
  hasError?: boolean
  className?: string
}

/**
 * Four-state delivery indicator matching WhatsApp Web:
 *   pending  → 🕓 (gray)
 *   sent     → ✓  (gray)
 *   delivered→ ✓✓ (gray)
 *   read     → ✓✓ (#53bdeb, the WhatsApp blue)
 *   error    → ⚠  (destructive)
 */
export function MessageStatus({
  status,
  hasError,
  className = "",
}: MessageStatusProps) {
  if (hasError) {
    return (
      <StatusIcon label={LABEL.error} className={className}>
        <IconAlertCircle
          className="text-destructive size-3.5"
          aria-hidden="true"
        />
      </StatusIcon>
    )
  }
  if (!status) return null
  switch (status) {
    case "pending":
      return (
        <StatusIcon label={LABEL.pending} className={className}>
          <IconClock
            className="text-muted-foreground/85 size-3 animate-pulse"
            aria-hidden="true"
          />
        </StatusIcon>
      )
    case "sent":
      return (
        <StatusIcon label={LABEL.sent} className={className}>
          <IconCheck
            className="text-muted-foreground/85 size-3.5"
            aria-hidden="true"
          />
        </StatusIcon>
      )
    case "delivered":
      return (
        <StatusIcon label={LABEL.delivered} className={className}>
          <IconChecks
            className="text-muted-foreground/85 size-3.5"
            aria-hidden="true"
          />
        </StatusIcon>
      )
    case "read":
      return (
        <StatusIcon label={LABEL.read} className={className}>
          <IconChecks
            className="text-wa-check-read size-3.5"
            aria-hidden="true"
          />
        </StatusIcon>
      )
  }
}

function StatusIcon({
  label,
  className,
  children,
}: {
  label: string
  className: string
  children: React.ReactNode
}) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center ${className}`}
          role="img"
          aria-label={label}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
