import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import * as React from "react"

import {
  type Tenant,
  ControlplaneError,
  listTenants,
  restartTenant,
  resumeTenant,
  suspendTenant,
} from "@/api/controlplane"
import { AdminGuard } from "@/components/admin/AdminGuard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function statusBadge(status: Tenant["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="default">active</Badge>
    case "provisioning":
      return <Badge variant="secondary">provisioning</Badge>
    case "suspended":
      return <Badge variant="outline">suspended</Badge>
    case "deleting":
      return <Badge variant="outline">deleting</Badge>
    case "error":
      return <Badge variant="destructive">error</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function TenantsList() {
  const qc = useQueryClient()
  const [filter, setFilter] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: listTenants,
    staleTime: 10_000,
  })

  const tenants = React.useMemo(() => {
    const term = filter.trim().toLowerCase()
    const all = data ?? []
    if (!term) return all
    return all.filter((t) =>
      [t.id, t.display_name, t.subdomain, t.owner_email]
        .join(" ")
        .toLowerCase()
        .includes(term),
    )
  }, [data, filter])

  const doAction = async (id: string, action: () => Promise<void>) => {
    setError(null)
    setBusy(id)
    try {
      await action()
      await qc.invalidateQueries({ queryKey: ["admin", "tenants"] })
    } catch (err) {
      if (err instanceof ControlplaneError) setError(err.detail)
      else if (err instanceof Error) setError(err.message)
      else setError("falha na operação")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tenants</h1>
          <p className="text-muted-foreground text-sm">
            {tenants.length} de {data?.length ?? 0} mostrado
            {tenants.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            Recarregar
          </Button>
          <Button asChild>
            <Link to="/admin/tenants/new">Novo tenant</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/admin/clone">Clonar</Link>
          </Button>
        </div>
      </header>

      <Input
        placeholder="Filtrar por id, nome, subdomínio ou e-mail"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {error ? (
        <div className="text-destructive text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Carregando…</div>
      ) : (
        <div className="border-border rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Nome</th>
                <th className="p-2">Sub</th>
                <th className="p-2">Owner</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{t.id}</td>
                  <td className="p-2">
                    <Link
                      to="/admin/tenants/$id"
                      params={{ id: t.id }}
                      className="hover:underline"
                    >
                      {t.display_name}
                    </Link>
                  </td>
                  <td className="p-2 font-mono text-xs">{t.subdomain}</td>
                  <td className="p-2">{t.owner_email}</td>
                  <td className="p-2">{statusBadge(t.status)}</td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      {t.status === "active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === t.id}
                          onClick={() =>
                            doAction(t.id, () => suspendTenant(t.id))
                          }
                        >
                          Suspender
                        </Button>
                      ) : null}
                      {t.status === "suspended" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === t.id}
                          onClick={() =>
                            doAction(t.id, () => resumeTenant(t.id))
                          }
                        >
                          Retomar
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === t.id}
                        onClick={() =>
                          doAction(t.id, () => restartTenant(t.id))
                        }
                      >
                        Restart
                      </Button>
                      <Button asChild variant="secondary" size="sm">
                        <Link to="/admin/tenants/$id" params={{ id: t.id }}>
                          Detalhe
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 ? (
                <tr>
                  <td
                    className="text-muted-foreground p-4 text-center"
                    colSpan={6}
                  >
                    Sem tenants.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  )
}

export const Route = createFileRoute("/admin/tenants/")({
  component: () => (
    <AdminGuard>
      <TenantsList />
    </AdminGuard>
  ),
})
