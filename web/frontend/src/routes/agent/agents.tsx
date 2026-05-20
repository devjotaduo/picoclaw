import { createFileRoute } from "@tanstack/react-router"

import { WorkspaceAgentsPage } from "@/components/agent/agents/workspace-agents-page"

export const Route = createFileRoute("/agent/agents")({
  component: WorkspaceAgentsRoute,
})

function WorkspaceAgentsRoute() {
  return <WorkspaceAgentsPage />
}
