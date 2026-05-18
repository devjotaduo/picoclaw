import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as React from "react"

import {
  type CloneTenantResponse,
  type SanityStatus,
  ControlplaneError,
  cloneTenant,
  listTenants,
} from "@/api/controlplane"
import { AdminGuard } from "@/components/admin/AdminGuard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function sanityBadge(status: SanityStatus) {
  switch (status) {
    case "ok":
      return <Badge variant="default">ok</Badge>
    case "warn":
      return <Badge variant="secondary">warn</Badge>
    case "fail":
      return <Badge variant="destructive">fail</Badge>
  }
}

interface CloneSearch {
  source?: string
}

function CloneWizard() {
  const navigate = useNavigate()
  const search = Route.useSearch() as CloneSearch
  const [source, setSource] = React.useState<string>(search.source ?? "")
  const [displayName, setDisplayName] = React.useState("")
  const [ownerEmail, setOwnerEmail] = React.useState("")
  const [subdomain, setSubdomain] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<CloneTenantResponse | null>(null)

  const tenantsQ = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: listTenants,
    staleTime: 10_000,
  })

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)
    try {
      const res = await cloneTenant(source, {
        display_name: displayName.trim(),
        owner_email: ownerEmail.trim().toLowerCase(),
        subdomain: subdomain.trim().toLowerCase(),
      })
      setResult(res)
    } catch (err) {
      if (err instanceof ControlplaneError) setError(err.detail)
      else if (err instanceof Error) setError(err.message)
      else setError("falha ao clonar")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Clonar tenant</h1>
        <p className="text-muted-foreground text-sm">
          Cópia raw da volume do tenant origem — preserva configuração, chaves,
          OAuth e senha do dashboard. Rotacione credenciais depois se for um
          operador diferente.
        </p>
      </header>

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="src-tenant">Tenant origem</Label>
          <select
            id="src-tenant"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            required
          >
            <option value="">— selecione —</option>
            {(tenantsQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name} ({t.subdomain})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-name">Nome do novo tenant</Label>
          <Input
            id="c-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-owner">E-mail do owner</Label>
          <Input
            id="c-owner"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-sub">Subdomínio</Label>
          <Input
            id="c-sub"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            placeholder="ex: acme-copia"
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/admin/tenants" })}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !source}>
            {submitting ? "Clonando…" : "Clonar"}
          </Button>
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Clone executado</CardTitle>
            <CardDescription>
              {result.tenant_id} · {result.url}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              {result.info ??
                "A senha do dashboard foi preservada do tenant origem. Rotacione no detalhe do novo tenant se necessário."}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {result.sanity_checks.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    <code className="font-mono">{c.name}</code>
                    {c.message ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        {c.message}
                      </span>
                    ) : null}
                  </span>
                  {sanityBadge(c.status)}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  navigate({
                    to: "/admin/tenants/$id",
                    params: { id: result.tenant_id },
                  })
                }
              >
                Abrir detalhe
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
    </div>
  )
}

export const Route = createFileRoute("/admin/clone")({
  validateSearch: (search: Record<string, unknown>): CloneSearch => ({
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  component: () => (
    <AdminGuard>
      <CloneWizard />
    </AdminGuard>
  ),
})
