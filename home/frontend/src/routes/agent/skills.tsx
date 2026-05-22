import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { SkillsPage } from "@/components/agent/skills/skills-page"

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
