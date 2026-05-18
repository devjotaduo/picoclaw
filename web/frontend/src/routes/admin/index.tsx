import { Link, createFileRoute } from "@tanstack/react-router"

import { AdminGuard } from "@/components/admin/AdminGuard"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function AdminLanding() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Administração</h1>
        <p className="text-muted-foreground text-sm">
          Caminho essencial de operação dos tenants. Painéis avançados (audit,
          users, intakes, CRM) seguem em adm.&lt;dominio&gt;.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tenants</CardTitle>
            <CardDescription>
              Liste, crie, suspenda, reinicie e remova tenants.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button asChild>
              <Link to="/admin/tenants">Abrir lista</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clone</CardTitle>
            <CardDescription>
              Clona um tenant existente preservando configuração e segredos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button asChild variant="outline">
              <Link to="/admin/clone">Abrir wizard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/admin/")({
  component: () => (
    <AdminGuard>
      <AdminLanding />
    </AdminGuard>
  ),
})
