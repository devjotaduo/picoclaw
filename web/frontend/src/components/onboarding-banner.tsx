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
 *  - CTA "Conversar com Sofia" → abre o chat com Sofia selecionada
 *    (Sofia é o default automaticamente, então /chat já vai pra ela)
 *  - Dismissable via X (cookie 24h) — operador pode esconder sem
 *    completar o cadastro se preferir
 *  - Desaparece automaticamente quando incomplete = false (sem reload)
 */

import { IconHeartHandshake, IconX } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { getLauncherPolicy } from "@/api/launcher-policy"

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

  const incomplete = policy?.onboarding?.incomplete === true
  const pending = policy?.onboarding?.pending ?? []

  // Limpa o dismiss quando o cadastro volta a ficar completo (estado se
  // resetá no próximo onboarding incompleto, se acontecer).
  useEffect(() => {
    if (!incomplete) clearDismissed()
  }, [incomplete])

  if (!incomplete || dismissed) return null

  const handleDismiss = () => {
    setDismissed()
    setDismissedState(true)
  }

  const countText =
    pending.length > 0
      ? `${pending.length} campo${pending.length === 1 ? "" : "s"} pendente${pending.length === 1 ? "" : "s"}`
      : "cadastro pendente"

  const hint =
    pending.length > 0
      ? `Faltando: ${pending.slice(0, 3).join(", ")}${pending.length > 3 ? "…" : ""}`
      : "Sem o cadastro, atendimento corre risco de inventar dados."

  return (
    <div
      data-testid="onboarding-banner"
      className="relative flex items-center gap-3 border-b border-amber-500/30 bg-gradient-to-r from-amber-50 via-amber-50/80 to-transparent px-4 py-2.5 text-sm dark:from-amber-950/40 dark:via-amber-950/20 dark:to-transparent"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <IconHeartHandshake className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-amber-900 dark:text-amber-100">
          Sofia precisa de você para terminar o cadastro · {countText}
        </p>
        <p className="truncate text-xs text-amber-800/80 dark:text-amber-200/70">
          {hint}
        </p>
      </div>

      <Link
        to="/"
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
      >
        Conversar com Sofia →
      </Link>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dispensar por 24h"
        className="shrink-0 rounded-md p-1 text-amber-700/70 transition-colors hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100"
      >
        <IconX className="size-4" />
      </button>
    </div>
  )
}
