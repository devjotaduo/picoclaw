import { createFileRoute } from "@tanstack/react-router"

import { TemplateEditorPage } from "@/components/agent/template-editor/template-editor-page"

export const Route = createFileRoute("/agent/template-editor")({
  component: AgentTemplateEditorRoute,
})

function AgentTemplateEditorRoute() {
  return <TemplateEditorPage />
}
