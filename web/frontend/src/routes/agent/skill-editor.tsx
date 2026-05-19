import { createFileRoute } from "@tanstack/react-router"

import { SkillEditorPage } from "@/components/agent/skill-editor/skill-editor-page"
import { AdminGuard } from "@/components/admin/AdminGuard"

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
