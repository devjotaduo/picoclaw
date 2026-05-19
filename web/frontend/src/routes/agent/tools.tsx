import { createFileRoute } from "@tanstack/react-router"

import { ToolsPage } from "@/components/agent/tools/tools-page"
import { AdminGuard } from "@/components/admin/AdminGuard"

export const Route = createFileRoute("/agent/tools")({
  component: AgentToolsRoute,
})

function AgentToolsRoute() {
  return (
    <AdminGuard>
      <ToolsPage />
    </AdminGuard>
  )
}
