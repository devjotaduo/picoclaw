import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { HubPage } from "@/components/agent/hub/hub-page"

export const Route = createFileRoute("/agent/hub")({
  component: AgentHubRoute,
})

function AgentHubRoute() {
  return (
    <AdminGuard>
      <HubPage />
    </AdminGuard>
  )
}
