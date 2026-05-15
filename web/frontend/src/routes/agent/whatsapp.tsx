import { createFileRoute } from "@tanstack/react-router"

import { WhatsAppInboxPage } from "@/components/agent/whatsapp/whatsapp-inbox-page"

export const Route = createFileRoute("/agent/whatsapp")({
  component: WhatsAppInboxRoute,
})

function WhatsAppInboxRoute() {
  return <WhatsAppInboxPage />
}
