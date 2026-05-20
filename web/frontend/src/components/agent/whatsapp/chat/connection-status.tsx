import { IconLoader2, IconPlugConnected, IconPlugX } from "@tabler/icons-react"

import type { InboxConnectionStatus } from "@/api/whatsapp"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface ConnectionStatusProps {
  status: InboxConnectionStatus
  /** Compact = only the dot + label. Default = dot + label + icon. */
  compact?: boolean
  className?: string
}

const COPY: Record<InboxConnectionStatus, { label: string; tooltip: string }> =
  {
    connecting: {
      label: "Conectando…",
      tooltip: "Conectando ao gateway WhatsApp",
    },
    online: {
      label: "Online",
      tooltip: "Gateway WhatsApp conectado e recebendo eventos em tempo real",
    },
    reconnecting: {
      label: "Reconectando…",
      tooltip: "Conexão instável. Tentando restabelecer o stream.",
    },
    offline: {
      label: "Offline",
      tooltip:
        "Sem conexão com o gateway. Mensagens não chegarão em tempo real.",
    },
  }

const DOT: Record<InboxConnectionStatus, string> = {
  connecting: "bg-amber-500",
  online: "bg-emerald-500",
  reconnecting: "bg-amber-500 animate-pulse",
  offline: "bg-destructive",
}

export function ConnectionStatus({
  status,
  compact = false,
  className = "",
}: ConnectionStatusProps) {
  const copy = COPY[status]
  const isWorking = status === "connecting" || status === "reconnecting"
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${
            status === "offline"
              ? "text-destructive bg-destructive/10"
              : status === "online"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          } ${className}`}
          role="status"
          aria-live="polite"
          aria-label={copy.tooltip}
        >
          <span
            className={`inline-block size-1.5 rounded-full ${DOT[status]}`}
            aria-hidden="true"
          />
          {!compact && copy.label}
          {!compact && isWorking && (
            <IconLoader2 className="size-3 animate-spin" aria-hidden="true" />
          )}
          {!compact && status === "online" && (
            <IconPlugConnected className="size-3" aria-hidden="true" />
          )}
          {!compact && status === "offline" && (
            <IconPlugX className="size-3" aria-hidden="true" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">
        {copy.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
