import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { SkillEditorPage } from "@/components/agent/skill-editor/skill-editor-page"

export const Route = createFileRoute("/agent/skill-editor")({
  component: AgentSkillEditorRoute,
})

function AgentSkillEditorRoute() {
  return (
    <AdminGuard>
      <SkillEditorPage />
    </AdminGuard>
  )
}
