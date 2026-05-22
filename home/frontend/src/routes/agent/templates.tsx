import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { TemplatesPage } from "@/components/agent/templates/templates-page"

export const Route = createFileRoute("/agent/templates")({
  component: AgentTemplatesRoute,
})

function AgentTemplatesRoute() {
  return (
    <AdminGuard>
      <TemplatesPage />
    </AdminGuard>
  )
}
