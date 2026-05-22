import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { WhatsAppInboxPage } from "@/components/agent/whatsapp/whatsapp-inbox-page"

const searchSchema = z.object({
  jid: z.string().optional(),
})

export const Route = createFileRoute("/agent/whatsapp")({
  component: WhatsAppInboxRoute,
  validateSearch: (search) => searchSchema.parse(search),
})

function WhatsAppInboxRoute() {
  const { jid } = Route.useSearch()
  return <WhatsAppInboxPage initialJID={jid} />
}
