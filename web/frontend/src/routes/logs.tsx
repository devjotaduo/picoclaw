import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { LogsPage } from "@/components/logs/logs-page"

export const Route = createFileRoute("/logs")({
  component: () => (
    <AdminGuard>
      <LogsPage />
    </AdminGuard>
  ),
})
