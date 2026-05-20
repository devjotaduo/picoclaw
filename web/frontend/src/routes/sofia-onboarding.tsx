import { createFileRoute } from "@tanstack/react-router"

import { SofiaOnboardingChatPage } from "@/components/public/sofia-onboarding-chat"

export const Route = createFileRoute("/sofia-onboarding")({
  component: SofiaOnboardingChatPage,
})
