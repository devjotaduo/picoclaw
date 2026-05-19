import { createFileRoute } from "@tanstack/react-router"

import { HubPage } from "@/components/agent/hub/hub-page"
import { AdminGuard } from "@/components/admin/AdminGuard"

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
