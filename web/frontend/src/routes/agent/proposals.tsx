import { createFileRoute } from "@tanstack/react-router"

import { AttendantProposalsCard } from "@/components/agent/proposals/attendant-proposals-card"

export const Route = createFileRoute("/agent/proposals")({
  component: AttendantProposalsRoute,
})

function AttendantProposalsRoute() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Propostas do assistente
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Mudanças que o assistente sugeriu para o atendente público, aguardando
          sua aprovação.
        </p>
      </div>
      <AttendantProposalsCard />
    </div>
  )
}
