/**
 * AttendantProposalsCard — the tenant owner's approval queue for changes the
 * assistant agent proposed to the public attendant (v2.0 approval-always).
 *
 * Each pending proposal shows its one-line summary, the assistant's rationale,
 * and Approve / Reject actions. Approve replays the change through the shared
 * apply path; reject discards it. Empty queue renders nothing so the card stays
 * out of the way until the assistant actually proposes something.
 *
 * Mirrors the notification panel's refined-minimalism: hairline-separated rows,
 * hierarchy via weight/opacity, a single amber accent for the pending dot.
 */
import { IconCheck, IconX } from "@tabler/icons-react"
import { useState } from "react"

import { type AttendantProposal } from "@/api/attendant-proposals"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAttendantProposals } from "@/hooks/use-attendant-proposals"
import { cn } from "@/lib/utils"

function formatRelativeTime(iso: string): string {
  const created = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - created) / 1000))
  if (diffSec < 60) return "agora"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

export function AttendantProposalsCard() {
  const {
    proposals,
    pendingCount,
    isLoading,
    approve,
    reject,
    decidingId,
    approveError,
  } = useAttendantProposals({ pendingOnly: true })

  // Stay invisible until there's something to decide — no empty-state noise.
  if (isLoading || pendingCount === 0) {
    return null
  }

  return (
    <Card data-testid="attendant-proposals-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Mudanças propostas pelo assistente
          <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold">
            {pendingCount}
          </span>
        </CardTitle>
        <CardDescription>
          O assistente sugeriu ajustes no atendente público. Revise e aprove para
          aplicar, ou rejeite para descartar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 p-0">
        <ul className="border-t">
          {proposals
            .filter((p) => p.status === "pending")
            .map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                deciding={decidingId === p.id}
                onApprove={() => approve(p)}
                onReject={() => reject(p)}
              />
            ))}
        </ul>
        {approveError && (
          <p className="text-destructive px-6 py-2 text-[12px]">
            {approveError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ProposalRow({
  proposal: p,
  deciding,
  onApprove,
  onReject,
}: {
  proposal: AttendantProposal
  deciding: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="border-b px-6 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-foreground text-[13px] font-medium leading-snug">
              {p.summary}
            </span>
            <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
              {formatRelativeTime(p.created_at)}
            </span>
          </div>
          {p.reason && (
            <p
              className={cn(
                "text-muted-foreground mt-0.5 text-[12px] leading-snug",
                !expanded && "line-clamp-2",
              )}
            >
              {p.reason}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground">
              alvo: {p.target_id}
              {p.proposed_by ? ` · via ${p.proposed_by}` : ""}
            </span>
            {p.reason && p.reason.length > 90 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-muted-foreground hover:text-foreground underline decoration-1 underline-offset-2"
              >
                {expanded ? "menos" : "mais"}
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={deciding}
              onClick={onApprove}
            >
              <IconCheck className="size-3.5" />
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={deciding}
              onClick={onReject}
            >
              <IconX className="size-3.5" />
              Rejeitar
            </Button>
          </div>
        </div>
      </div>
    </li>
  )
}
