import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/agent/orchestration")({
  beforeLoad: () => {
    throw redirect({ to: "/agent/editor" })
  },
  component: () => null,
})
