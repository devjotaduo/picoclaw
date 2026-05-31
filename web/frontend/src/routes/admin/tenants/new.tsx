import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as React from "react"

import {
  ControlplaneError,
  createTenant,
  listLauncherProfiles,
  listTenantTypes,
} from "@/api/controlplane"
import { AdminGuard } from "@/components/admin/AdminGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TypeCard {
  // id is the tenant_type slug: a system type (publico/admin/cliente) or a
  // catalog vertical slug (clinica, loja, …).
  id: string
  title: string
  tagline: string
  bullets: string[]
}

// The three cards the admin sees in step 1. Order matters — "cliente" is
// the safe default and goes last so the eye lands on it after scanning the
// two more specialised options.
const TYPE_CARDS: TypeCard[] = [
  {
    id: "publico",
    title: "Público",
    tagline: "Chat anônimo, sem login",
    bullets: [
      "Visitante interage sem cadastro",
      "Sem owner, sem senha, sem painel",
      "Usado para landing / discovery / Sofia",
    ],
  },
  {
    id: "admin",
    title: "Admin",
    tagline: "Painel SaaS interno",
    bullets: [
      "Sidebar /admin/* habilitada",
      "Owner é membro do time",
      "Tudo visível: skills, tools, logs, config",
    ],
  },
  {
    id: "cliente",
    title: "Cliente",
    tagline: "Cliente pagante (default)",
    bullets: [
      "Owner recebe credenciais por email",
      "Vê chat, agente, WhatsApp, config básica",
      "Sem ferramentas de admin",
    ],
  },
]

function NewTenantForm() {
  const navigate = useNavigate()
  const [type, setType] = React.useState<string | null>(null)
  const [displayName, setDisplayName] = React.useState("")
  const [ownerEmail, setOwnerEmail] = React.useState("")
  const [subdomain, setSubdomain] = React.useState("")
  const [workspaceId, setWorkspaceId] = React.useState("")
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [budget, setBudget] = React.useState("")
  const [memMb, setMemMb] = React.useState("")
  const [cpuQuota, setCpuQuota] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // listLauncherProfiles returns the workspace catalog under the legacy
  // name. Until the API gets a dedicated /workspaces route, this is the
  // source of truth for what the admin can pick from.
  const workspaces = useQuery({
    queryKey: ["launcher-profiles"],
    queryFn: listLauncherProfiles,
    enabled: Boolean(type),
    retry: false,
  })

  // v2.0: fetch the tenant_types catalog and append business verticals to the
  // three curated system cards. Additive — if the fetch fails the wizard still
  // shows the system types.
  const tenantTypes = useQuery({
    queryKey: ["tenant-types", "selectable"],
    queryFn: () => listTenantTypes(true),
    retry: false,
  })
  const cards: TypeCard[] = React.useMemo(() => {
    const verticals: TypeCard[] = (tenantTypes.data ?? [])
      .filter((t) => !t.is_system)
      .map((t) => ({
        id: t.slug,
        title: t.display_name,
        tagline: t.description,
        bullets: [],
      }))
    return [...TYPE_CARDS, ...verticals]
  }, [tenantTypes.data])

  // Públicos não têm owner — email é hidden e não obrigatório.
  const needsOwnerEmail = type !== "publico"

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!type) return
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const res = await createTenant({
        display_name: displayName.trim(),
        owner_email: needsOwnerEmail ? ownerEmail.trim().toLowerCase() : "",
        subdomain: subdomain.trim().toLowerCase(),
        tenant_type: type,
        workspace_id: workspaceId || undefined,
        monthly_budget_usd: budget ? Number(budget) : undefined,
        mem_limit_mb: memMb ? Number(memMb) : undefined,
        cpu_quota: cpuQuota ? Number(cpuQuota) : undefined,
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

  // Step 1: type picker.
  if (!type) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Novo tenant</h1>
            <p className="text-muted-foreground text-sm">
              Escolha o tipo. Isso define o que o usuário vai ver (a UI inteira
              sai de{" "}
              <code className="font-mono text-xs">ui-visibility.json</code> do
              workspace; o tipo selecionado vira o{" "}
              <code className="font-mono text-xs">active_profile</code>).
            </p>
          </header>
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setType(card.id)}
                className="border-border hover:border-primary hover:bg-accent/30 group flex flex-col gap-3 rounded-lg border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <div>
                  <div className="text-foreground text-lg font-semibold">
                    {card.title}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {card.tagline}
                  </div>
                </div>
                <ul className="text-muted-foreground flex flex-col gap-1.5 text-sm">
                  {card.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="text-primary/60">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          <div className="flex justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/admin/tenants" })}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: form for the chosen type.
  const card = cards.find((c) => c.id === type) ?? cards[0]
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setType(null)}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              ← tipo
            </button>
            <span className="text-muted-foreground text-xs">/</span>
            <span className="text-foreground text-sm font-medium">
              {card.title}
            </span>
          </div>
          <h1 className="text-2xl font-semibold">Novo tenant — {card.title}</h1>
          <p className="text-muted-foreground text-sm">{card.tagline}</p>
        </header>
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-name">Nome</Label>
            <Input
              id="t-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={
                type === "publico"
                  ? "ex: Onboarding"
                  : type === "admin"
                    ? "ex: Operações"
                    : "ex: Acme Corp"
              }
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-sub">Subdomínio</Label>
            <Input
              id="t-sub"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder={
                type === "publico"
                  ? "onboarding"
                  : type === "admin"
                    ? "ops"
                    : "acme"
              }
              required
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          {needsOwnerEmail ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-owner">E-mail do owner</Label>
              <Input
                id="t-owner"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
              />
              {type === "admin" && (
                <p className="text-muted-foreground text-xs">
                  Será um membro do time interno com role tenant_owner.
                </p>
              )}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-ws">Workspace</Label>
            <select
              id="t-ws"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">(default)</option>
              {(workspaces.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.is_default ? " · default" : ""}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              Define o conteúdo do volume (skills, agents, ui-visibility.json).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-muted-foreground hover:text-foreground self-start text-xs underline"
          >
            {showAdvanced ? "▾ avançado" : "▸ avançado"}
          </button>
          {showAdvanced && (
            <div className="border-border/60 grid grid-cols-3 gap-3 rounded-md border border-dashed p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-budget">Budget USD/mês</Label>
                <Input
                  id="t-budget"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="5"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-mem">Memória MB</Label>
                <Input
                  id="t-mem"
                  type="number"
                  min="128"
                  max="8192"
                  placeholder="512"
                  value={memMb}
                  onChange={(e) => setMemMb(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-cpu">CPU quota</Label>
                <Input
                  id="t-cpu"
                  type="number"
                  min="0.1"
                  max="8"
                  step="0.1"
                  placeholder="0.5"
                  value={cpuQuota}
                  onChange={(e) => setCpuQuota(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setType(null)}
            >
              Voltar
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
