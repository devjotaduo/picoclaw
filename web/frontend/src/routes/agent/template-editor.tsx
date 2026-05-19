import { createFileRoute } from "@tanstack/react-router"

import { TemplateEditorPage } from "@/components/agent/template-editor/template-editor-page"
import { AdminGuard } from "@/components/admin/AdminGuard"

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
