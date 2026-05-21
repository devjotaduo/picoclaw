import { createFileRoute } from "@tanstack/react-router"

import { PendenciasPage } from "@/components/operacao/pendencias-page"

export const Route = createFileRoute("/pendencias")({
  component: PendenciasPage,
})
