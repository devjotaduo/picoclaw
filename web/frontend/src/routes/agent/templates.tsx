import { createFileRoute } from "@tanstack/react-router"

import { TemplatesPage } from "@/components/agent/templates/templates-page"
import { AdminGuard } from "@/components/admin/AdminGuard"

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
