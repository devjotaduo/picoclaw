import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { ModelsPage } from "@/components/models/models-page"

export const Route = createFileRoute("/models")({
  component: () => (
    <AdminGuard>
      <ModelsPage />
    </AdminGuard>
  ),
})
