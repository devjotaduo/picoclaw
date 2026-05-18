import {
  IconCheck,
  IconChevronLeft,
  IconCopy,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import * as React from "react"

import {
  type SanityStatus,
  type TenantStatus,
  ControlplaneError,
  deleteTenant,
  getTenant,
  recreateTenant,
  restartTenant,
  resumeTenant,
  rotateTenantPassword,
  suspendTenant,
  tenantSanity,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function sanityBadge(status: SanityStatus) {
  switch (status) {
    case "ok":
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          ok
        </Badge>
      )
    case "warn":
      return (
        <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">
          warn
        </Badge>
      )
    case "fail":
      return <Badge variant="destructive">fail</Badge>
  }
}

function tenantStatusBadge(status: TenantStatus) {
  const dot = (className: string) => (
    <span
      className={cn("inline-block size-1.5 rounded-full", className)}
      aria-hidden="true"
    />
  )
  switch (status) {
    case "active":
      return (
        <Badge className="gap-1.5 border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          {dot("bg-emerald-500")}
          active
        </Badge>
      )
    case "suspended":
      return (
        <Badge className="gap-1.5 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">
          {dot("bg-amber-500")}
          suspended
        </Badge>
      )
    case "provisioning":
      return (
        <Badge className="gap-1.5 border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300">
          {dot("bg-sky-500 animate-pulse")}
          provisioning
        </Badge>
      )
    case "deleting":
      return (
        <Badge variant="outline" className="gap-1.5">
          {dot("bg-muted-foreground")}
          deleting
        </Badge>
      )
    case "error":
      return (
        <Badge variant="destructive" className="gap-1.5">
          {dot("bg-destructive-foreground")}
          error
        </Badge>
      )
  }
}

function describeError(err: unknown): string {
  if (err instanceof ControlplaneError) return err.detail
  if (err instanceof Error) return err.message
  return "falha"
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = React.useCallback(() => {
    if (!navigator.clipboard?.writeText) return
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }, [value])
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={label}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:ring-ring inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-hidden focus-visible:ring-2"
        >
          {copied ? (
            <IconCheck className="size-3.5 text-emerald-500" />
          ) : (
            <IconCopy className="size-3.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copiado" : label}</TooltipContent>
    </Tooltip>
  )
}

function MonoValue({
  value,
  copyLabel,
  truncate = false,
}: {
  value: string
  copyLabel: string
  truncate?: boolean
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <code
            className={cn(
              "font-mono text-xs",
              truncate && "block min-w-0 max-w-full truncate",
            )}
          >
            {value}
          </code>
        </TooltipTrigger>
        <TooltipContent className="font-mono text-xs">{value}</TooltipContent>
      </Tooltip>
      <CopyButton value={value} label={copyLabel} />
    </span>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/40 py-2 last:border-b-0 sm:grid sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-3">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide sm:text-sm sm:normal-case sm:tracking-normal">
        {label}
      </dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function TenantDetail({ id }: { id: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = React.useState<string | null>(null)
  const [rotatedPassword, setRotatedPassword] = React.useState<string | null>(
    null,
  )

  const tenantQ = useQuery({
    queryKey: ["admin", "tenant", id],
    queryFn: () => getTenant(id),
  })
  const sanityQ = useQuery({
    queryKey: ["admin", "tenant", id, "sanity"],
    queryFn: () => tenantSanity(id),
    enabled: Boolean(id),
  })

  const invalidate = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["admin", "tenant", id] })
    void qc.invalidateQueries({ queryKey: ["admin", "tenants"] })
  }, [qc, id])

  const onErr = React.useCallback(
    (err: unknown) => setError(describeError(err)),
    [],
  )

  const suspendM = useMutation({
    mutationFn: () => suspendTenant(id),
    onError: onErr,
    onSuccess: invalidate,
  })
  const resumeM = useMutation({
    mutationFn: () => resumeTenant(id),
    onError: onErr,
    onSuccess: invalidate,
  })
  const restartM = useMutation({
    mutationFn: () => restartTenant(id),
    onError: onErr,
    onSuccess: invalidate,
  })
  const recreateM = useMutation({
    mutationFn: () => recreateTenant(id),
    onError: onErr,
    onSuccess: invalidate,
  })
  const rotateM = useMutation({
    mutationFn: () => rotateTenantPassword(id),
    onError: onErr,
    onSuccess: (data) => setRotatedPassword(data.initial_password),
  })
  const deleteM = useMutation({
    mutationFn: () => deleteTenant(id),
    onError: onErr,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "tenants"] })
      void navigate({ to: "/admin/tenants" })
    },
  })

  const t = tenantQ.data

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <nav
          className="text-muted-foreground flex items-center gap-1 text-xs"
          aria-label="Breadcrumb"
        >
          <Link to="/admin" className="hover:text-foreground transition-colors">
            Admin
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            to="/admin/tenants"
            className="hover:text-foreground transition-colors"
          >
            Tenants
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground truncate font-medium" title={id}>
            {t?.display_name ?? id}
          </span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="mt-1 shrink-0"
              aria-label="Voltar à lista"
            >
              <Link to="/admin/tenants">
                <IconChevronLeft className="size-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold">
                  {t?.display_name ?? id}
                </h1>
                {t ? tenantStatusBadge(t.status) : null}
              </div>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <code className="font-mono text-xs">{id}</code>
                {t ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <code className="font-mono text-xs">{t.subdomain}</code>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </header>

        {error ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {tenantQ.isLoading ? (
          <div className="flex flex-col gap-3">
            <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
            <div className="bg-muted/40 h-24 animate-pulse rounded-lg" />
            <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
          </div>
        ) : t ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Detalhes</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col">
                  <DetailRow label="Status">{tenantStatusBadge(t.status)}</DetailRow>
                  <DetailRow label="Container">
                    {t.container_id ? (
                      <MonoValue
                        value={t.container_id}
                        copyLabel="Copiar container id"
                        truncate
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </DetailRow>
                  <DetailRow label="Owner">{t.owner_email}</DetailRow>
                  <DetailRow label="Profile">
                    {t.launcher_profile_id ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <code className="font-mono text-xs">
                          {t.launcher_profile_id}
                        </code>
                        {t.launcher_profile_version_applied ? (
                          <Badge variant="outline" className="font-mono">
                            v{t.launcher_profile_version_applied}
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </DetailRow>
                  <DetailRow label="CPU / RAM">
                    {t.cpu_quota} cpu · {t.mem_limit_mb} MB
                  </DetailRow>
                  <DetailRow label="Budget mensal">
                    {t.monthly_budget_usd != null
                      ? `US$ ${t.monthly_budget_usd.toFixed(2)}`
                      : "—"}
                  </DetailRow>
                  <DetailRow label="Criado em">
                    {new Date(t.created_at).toLocaleString()}
                  </DetailRow>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ações</CardTitle>
                <CardDescription>
                  Operações destrutivas pedem confirmação.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={restartM.isPending}
                  onClick={() => restartM.mutate()}
                >
                  Restart
                </Button>
                {t.status === "active" ? (
                  <Button
                    variant="outline"
                    disabled={suspendM.isPending}
                    onClick={() => suspendM.mutate()}
                  >
                    Suspender
                  </Button>
                ) : null}
                {t.status === "suspended" ? (
                  <Button
                    variant="outline"
                    disabled={resumeM.isPending}
                    onClick={() => resumeM.mutate()}
                  >
                    Retomar
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  disabled={recreateM.isPending}
                  onClick={() => {
                    if (confirm("Recriar o container do tenant?"))
                      recreateM.mutate()
                  }}
                >
                  Recriar container
                </Button>
                <Button
                  variant="outline"
                  disabled={rotateM.isPending}
                  onClick={() => rotateM.mutate()}
                >
                  Rotacionar senha
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/admin/clone" search={{ source: id }}>
                    Clonar este tenant
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteM.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Apagar o tenant ${t.display_name}? Esta ação é destrutiva.`,
                      )
                    )
                      deleteM.mutate()
                  }}
                >
                  Apagar
                </Button>
              </CardContent>
            </Card>

            {rotatedPassword ? (
              <Card className="border-emerald-500/40 bg-emerald-500/5">
                <CardHeader>
                  <CardTitle>Nova senha do dashboard</CardTitle>
                  <CardDescription>
                    Mostrada apenas uma vez. Guarde agora.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <code className="bg-muted block min-w-0 flex-1 truncate rounded p-2 font-mono text-sm">
                    {rotatedPassword}
                  </code>
                  <CopyButton
                    value={rotatedPassword}
                    label="Copiar senha"
                  />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Sanity checks</CardTitle>
                <CardDescription>
                  Estado do volume, container e endpoints internos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sanityQ.isLoading ? (
                  <div className="flex flex-col gap-2">
                    <div className="bg-muted/40 h-5 animate-pulse rounded" />
                    <div className="bg-muted/40 h-5 animate-pulse rounded" />
                    <div className="bg-muted/40 h-5 animate-pulse rounded" />
                  </div>
                ) : (sanityQ.data?.sanity_checks ?? []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Sem checks reportados.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border/40 text-sm">
                    {(sanityQ.data?.sanity_checks ?? []).map((c) => (
                      <li
                        key={c.name}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 flex-1">
                          <code className="font-mono text-xs">{c.name}</code>
                          {c.message ? (
                            <span className="text-muted-foreground ml-1">
                              · {c.message}
                            </span>
                          ) : null}
                        </span>
                        {sanityBadge(c.status)}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-muted-foreground text-sm">
            Tenant não encontrado.
          </div>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/admin/tenants/$id")({
  component: () => {
    const { id } = Route.useParams()
    return (
      <AdminGuard>
        <TenantDetail id={id} />
      </AdminGuard>
    )
  },
})
