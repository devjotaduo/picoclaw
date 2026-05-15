import { createFileRoute } from "@tanstack/react-router"

import { TemplatesPage } from "@/components/agent/templates/templates-page"

export const Route = createFileRoute("/agent/templates")({
  component: AgentTemplatesRoute,
})

function AgentTemplatesRoute() {
  return <TemplatesPage />
}
