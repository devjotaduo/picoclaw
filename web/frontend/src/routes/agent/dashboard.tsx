import { createFileRoute } from "@tanstack/react-router"

import { AgentDashboardPage } from "@/components/agent/dashboard/agent-dashboard-page"

export const Route = createFileRoute("/agent/dashboard")({
  component: AgentDashboardRoute,
})

function AgentDashboardRoute() {
  return <AgentDashboardPage />
}
