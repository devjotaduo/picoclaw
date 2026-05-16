import { createFileRoute } from "@tanstack/react-router"

import { WhatsAppReportsPage } from "@/components/agent/whatsapp/whatsapp-reports-page"

export const Route = createFileRoute("/agent/whatsapp-reports")({
  component: WhatsAppReportsRoute,
})

function WhatsAppReportsRoute() {
  return <WhatsAppReportsPage />
}
