import { createFileRoute } from "@tanstack/react-router"

import { CronPage } from "@/components/operacao/cron-page"

export const Route = createFileRoute("/cron")({
  component: CronPage,
})
