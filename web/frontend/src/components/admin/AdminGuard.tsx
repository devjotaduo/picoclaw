import * as React from "react"

import { getLauncherPolicy } from "@/api/launcher-policy"
import { Forbidden } from "@/components/admin/Forbidden"

interface AdminGuardProps {
  children: React.ReactNode
}

type GuardState =
  | { kind: "loading" }
  | { kind: "denied"; message?: string }
  | { kind: "allowed" }

/**
 * SaaS admin gate. The user is already authenticated against the launcher
 * dashboard (otherwise they wouldn't reach this component). All we do here is
 * confirm that this launcher process is configured to act as a SaaS admin —
 * i.e. that the controlplane proxy at /api/admin/saas/* is live.
 *
 * If `is_saas_admin` is false (env vars missing, or the launcher is in a
 * tenant trusted-gateway context where the user isn't platform_admin) the
 * Forbidden page is rendered. No redirects.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const [state, setState] = React.useState<GuardState>({ kind: "loading" })

  React.useEffect(() => {
    let cancelled = false
    getLauncherPolicy()
      .then((p) => {
        if (cancelled) return
        if (p.is_saas_admin) {
          setState({ kind: "allowed" })
        } else {
          setState({
            kind: "denied",
            message:
              "Este launcher não está em modo SaaS admin. Defina PICOCLAW_SAAS_ADMIN_MODE=true e as credenciais do controlplane (PICOCLAW_SAAS_BASE_URL/EMAIL/PASSWORD) no systemd unit.",
          })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: "denied",
          message: err instanceof Error ? err.message : "falha ao validar",
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === "loading") {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        Verificando permissões…
      </div>
    )
  }
  if (state.kind === "denied") {
    return <Forbidden message={state.message} />
  }
  return <>{children}</>
}
