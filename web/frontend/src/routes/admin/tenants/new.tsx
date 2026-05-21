import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as React from "react"

import {
  ControlplaneError,
  createTenant,
  listLauncherProfiles,
} from "@/api/controlplane"
import { AdminGuard } from "@/components/admin/AdminGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function NewTenantForm() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = React.useState("")
  const [ownerEmail, setOwnerEmail] = React.useState("")
  const [subdomain, setSubdomain] = React.useState("")
  const [profileId, setProfileId] = React.useState("")
  const [budget, setBudget] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const profiles = useQuery({
    queryKey: ["launcher-profiles"],
    queryFn: listLauncherProfiles,
  })

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const res = await createTenant({
        display_name: displayName.trim(),
        owner_email: ownerEmail.trim().toLowerCase(),
        subdomain: subdomain.trim().toLowerCase(),
        launcher_profile_id: profileId || undefined,
        monthly_budget_usd: budget ? Number(budget) : undefined,
      })
      setSuccess(`Criado tenant ${res.tenant_id} em ${res.url}`)
      setTimeout(() => {
        void navigate({
          to: "/admin/tenants/$id",
          params: { id: res.tenant_id },
        })
      }, 1200)
    } catch (err) {
      if (err instanceof ControlplaneError) setError(err.detail)
      else if (err instanceof Error) setError(err.message)
      else setError("falha ao criar tenant")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Novo tenant</h1>
          <p className="text-muted-foreground text-sm">
            Provisiona um novo container a partir do launcher profile
            selecionado.
          </p>
        </header>
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-name">Nome</Label>
            <Input
              id="t-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-owner">E-mail do owner</Label>
            <Input
              id="t-owner"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-sub">Subdomínio</Label>
            <Input
              id="t-sub"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="ex: acme"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-profile">Launcher profile</Label>
            <select
              id="t-profile"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">(padrão)</option>
              {(profiles.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default ? " · default" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-budget">Budget mensal USD (opcional)</Label>
            <Input
              id="t-budget"
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
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
            <Button type="submit" disabled={submitting}>
              {submitting ? "Criando…" : "Criar tenant"}
            </Button>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {success}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/admin/tenants/new")({
  component: () => (
    <AdminGuard>
      <NewTenantForm />
    </AdminGuard>
  ),
})
