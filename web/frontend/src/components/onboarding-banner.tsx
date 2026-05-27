/**
 * OnboardingBanner
 *
 * Banner topo do app que aparece enquanto o cadastro da empresa
 * (memory/empresa.md) ainda está em template. Sinal vem da
 * launcher policy (`onboarding.incomplete`) que reflete o MESMO critério
 * usado no backend pra promover Sofia como default agent (ver
 * pkg/agent/onboarding_default.go).
 *
 * Comportamento:
 *  - Aparece quando onboarding.incomplete = true
 *  - Mostra contagem de campos pendentes quando disponível
 *  - Dismissable via X (cookie 24h) — operador pode esconder sem
 *    completar o cadastro se preferir
 *  - Desaparece automaticamente quando incomplete = false (sem reload)
 */
import { IconCircleDot, IconX } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { getLauncherPolicy } from "@/api/launcher-policy"
import { useUIVisibility } from "@/hooks/use-ui-visibility"

const DISMISS_KEY = "picoclaw.onboarding-banner.dismissed-at"
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function isDismissedRecently(): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = parseInt(raw, 10)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function setDismissed(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // best-effort — Safari private mode etc.
  }
}

function clearDismissed(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(DISMISS_KEY)
  } catch {
    // best-effort
  }
}

export function OnboardingBanner() {
  const [dismissed, setDismissedState] = useState(() => isDismissedRecently())

  const { data: policy } = useQuery({
    queryKey: ["launcher-policy"],
    queryFn: getLauncherPolicy,
    staleTime: 30_000,
    refetchInterval: 60_000, // re-check every minute pra esconder rápido quando completar
  })

  // Hide entirely in public tenants — the visitor IS the lead that's about
  // to be onboarded by Sofia. They're not the operator of a half-onboarded
  // business; the "Cadastro incompleto" framing confuses anonymous visitors
  // who never agreed to onboard anything yet. Sofia's discovery flow is the
  // onboarding here, not a banner on top of the chat.
  const { profile } = useUIVisibility(policy)
  const isPublicTenant = profile === "public"

  const incomplete = policy?.onboarding?.incomplete === true
  const pending = policy?.onboarding?.pending ?? []

  // Limpa o dismiss quando o cadastro volta a ficar completo (estado se
  // resetá no próximo onboarding incompleto, se acontecer).
  useEffect(() => {
    if (!incomplete) clearDismissed()
  }, [incomplete])

  if (isPublicTenant || !incomplete || dismissed) return null

  const handleDismiss = () => {
    setDismissed()
    setDismissedState(true)
  }

  const detail =
    pending.length > 0
      ? pending.length === 1
        ? "1 informação ainda precisa ser preenchida."
        : `${pending.length} informações ainda precisam ser preenchidas.`
      : "Faltam algumas informações da empresa."

  return (
    <div
      data-testid="onboarding-banner"
      className="border-border/60 bg-background/95 flex min-h-11 items-center gap-3 border-b px-6 py-2 text-sm"
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
      >
        <IconCircleDot className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">
          Cadastro incompleto
        </p>
        <p className="text-muted-foreground truncate text-xs">{detail}</p>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dispensar por 24h"
        className="text-muted-foreground hover:text-foreground -mr-1 shrink-0 rounded p-1 transition-colors"
      >
        <IconX className="size-3.5" />
      </button>
    </div>
  )
}
