import { createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { CredentialsPage } from "@/components/credentials/credentials-page"

export const Route = createFileRoute("/credentials")({
  component: () => (
    <AdminGuard>
      <CredentialsPage />
    </AdminGuard>
  ),
})
