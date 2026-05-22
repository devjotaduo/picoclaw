import { createFileRoute } from "@tanstack/react-router"

import { ReadinessPage } from "@/components/operacao/readiness-page"

export const Route = createFileRoute("/readiness")({
  component: ReadinessPage,
})
