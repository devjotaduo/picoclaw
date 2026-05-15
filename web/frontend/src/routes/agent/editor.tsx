import { createFileRoute } from "@tanstack/react-router"

import { AgentEditorPage } from "@/components/agent/editor/agent-editor-page"

export const Route = createFileRoute("/agent/editor")({
  component: AgentEditorRoute,
})

function AgentEditorRoute() {
  return <AgentEditorPage />
}
