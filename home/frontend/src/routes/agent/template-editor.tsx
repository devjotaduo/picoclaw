import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { TemplateEditorPage } from "@/components/agent/template-editor/template-editor-page"

export const Route = createFileRoute("/agent/template-editor")({
  component: AgentTemplateEditorRoute,
})

function AgentTemplateEditorRoute() {
  return (
    <AdminGuard>
      <TemplateEditorPage />
    </AdminGuard>
  )
}
