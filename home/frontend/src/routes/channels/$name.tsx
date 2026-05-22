import { Navigate, createFileRoute } from "@tanstack/react-router"

import { ChannelConfigPage } from "@/components/channels/channel-config-page"

export const Route = createFileRoute("/channels/$name")({
  component: ChannelsByNameRoute,
})

function ChannelsByNameRoute() {
  const { name } = Route.useParams()

  if (name === "whatsapp_native") {
    return <Navigate to="/agent/whatsapp" replace />
  }

  return <ChannelConfigPage channelName={name} />
}
