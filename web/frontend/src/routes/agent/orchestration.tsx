import { createFileRoute } from "@tanstack/react-router"

import { OrchestrationPage } from "@/components/agent/orchestration/orchestration-page"

export const Route = createFileRoute("/agent/orchestration")({
  component: OrchestrationRoute,
})

function OrchestrationRoute() {
  return <OrchestrationPage />
}
