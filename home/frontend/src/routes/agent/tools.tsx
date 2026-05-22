import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { ToolsPage } from "@/components/agent/tools/tools-page"

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
