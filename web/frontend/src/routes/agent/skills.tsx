import { createFileRoute } from "@tanstack/react-router"

import { SkillsPage } from "@/components/agent/skills/skills-page"
import { AdminGuard } from "@/components/admin/AdminGuard"

export const Route = createFileRoute("/agent/skills")({
  component: AgentSkillsRoute,
})

function AgentSkillsRoute() {
  return (
    <AdminGuard>
      <SkillsPage />
    </AdminGuard>
  )
}
