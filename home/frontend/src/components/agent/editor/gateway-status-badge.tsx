import {
  IconCircleCheck,
  IconCircleX,
  IconExternalLink,
} from "@tabler/icons-react"
import { useAtomValue } from "jotai"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { gatewayAtom } from "@/store/gateway"

import { formatPhoneBR, jidToPhone } from "./whatsapp-format"

function maskPhone(phone: string): string {
  if (!phone) return ""
  const tail = phone.slice(-6)
  return `+${"X".repeat(Math.max(0, phone.length - 6))} ${tail.slice(0, 1)}…${tail.slice(-3)}`
}

export interface GatewayStatusBadgeProps {
  boundJID?: string
  onLinkClick?: () => void
}

export function GatewayStatusBadge({
  boundJID,
  onLinkClick,
}: GatewayStatusBadgeProps) {
  const gw = useAtomValue(gatewayAtom)
  const online = gw.status === "running"
  const phone = boundJID ? jidToPhone(boundJID) : ""
  const display = phone ? formatPhoneBR(phone) : ""

  if (online && phone) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 transition-colors duration-200 dark:bg-emerald-500/20 dark:text-emerald-300"
          >
            <IconCircleCheck className="size-3.5" aria-hidden="true" />
            Online · {maskPhone(phone)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          Gateway ativo, vinculado a {display}.
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "border-border/60 bg-muted/60 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-200",
          gw.status === "error" &&
            "bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
        )}
      >
        <IconCircleX className="size-3.5" aria-hidden="true" />
        {online ? "Gateway ativo (sem vínculo)" : "Sem gateway"}
      </span>
      {onLinkClick && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLinkClick}
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <IconExternalLink className="size-3" aria-hidden="true" />
          Vincular
        </Button>
      )}
    </div>
  )
}
