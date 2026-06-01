/**
 * LeadsCard — leads derivados de notificações de vendas + items do painel
 * (ver use-leads). Pill de temperatura quente/morno/frio.
 */
import { IconTargetArrow } from "@tabler/icons-react"

import { RailCard, RailEmpty } from "@/components/right-rail/rail-card"
import { formatRailTime } from "@/components/right-rail/rail-utils"
import { type LeadSignal, type LeadTemperature, useLeads } from "@/hooks/use-leads"
import { cn } from "@/lib/utils"

const TEMPERATURE_LABEL: Record<LeadTemperature, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  unknown: "Novo",
}

const TEMPERATURE_CLASS: Record<LeadTemperature, string> = {
  hot: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  warm: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cold: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  unknown: "bg-muted text-muted-foreground",
}

export function LeadsCard() {
  const { leads } = useLeads()
  const hot = leads.filter((l) => l.temperature === "hot").length

  return (
    <RailCard
      icon={IconTargetArrow}
      title="Leads"
      count={leads.length}
      highlight={hot > 0}
    >
      {leads.length === 0 ? (
        <RailEmpty>Nenhum lead sinalizado ainda.</RailEmpty>
      ) : (
        <ul className="space-y-1 px-1">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </ul>
      )}
    </RailCard>
  )
}

function LeadRow({ lead }: { lead: LeadSignal }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground truncate text-[12px] font-medium">
          {lead.title}
        </span>
        <span className="text-muted-foreground/40 shrink-0 text-[10px] tabular-nums">
          {formatRailTime(lead.stamp)}
        </span>
      </div>
      {lead.body ? (
        <p className="text-muted-foreground/70 mt-0.5 line-clamp-1 text-[11px]">
          {lead.body}
        </p>
      ) : null}
      <div className="mt-1 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
            TEMPERATURE_CLASS[lead.temperature],
          )}
        >
          {TEMPERATURE_LABEL[lead.temperature]}
        </span>
        {lead.agentName ? (
          <span className="text-muted-foreground/50 text-[10px]">
            via {lead.agentName}
          </span>
        ) : null}
      </div>
    </>
  )

  if (lead.ctaUrl) {
    return (
      <li>
        <a
          href={lead.ctaUrl}
          {...(lead.ctaUrl.startsWith("/")
            ? {}
            : { target: "_blank", rel: "noreferrer" })}
          className="hover:bg-muted/40 block rounded-md px-2 py-2 transition-colors"
        >
          {body}
        </a>
      </li>
    )
  }

  return (
    <li className="hover:bg-muted/40 rounded-md px-2 py-2 transition-colors">
      {body}
    </li>
  )
}
