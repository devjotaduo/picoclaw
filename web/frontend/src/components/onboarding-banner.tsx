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

import { IconX } from "@tabler/icons-react"
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

  // Refined-minimal: zero gradient, sem ícone categórico, 1 linha, link
  // sublinhado em vez de botão. Indicador de estado fica num único dot
  // que pulsa sutilmente (a única microinteração). Hairline border-bottom
  // separa do conteúdo abaixo sem cards/sombras.
  return (
    <div
      data-testid="onboarding-banner"
      className="relative flex items-center gap-3 border-b border-border/50 bg-background px-4 py-2 text-[13px]"
    >
      {/* Dot indicador minimal (acento âmbar — único toque de cor) */}
      <span
        aria-hidden="true"
        className="relative size-1.5 shrink-0 rounded-full bg-amber-500"
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-60" />
      </span>

      <p className="min-w-0 flex-1 truncate text-foreground/80">
        <span className="font-medium text-foreground">Cadastro pendente</span>
        <span className="mx-2 text-foreground/30">·</span>
        <span className="text-foreground/60">{countText}</span>
      </p>

      <Link
        to="/"
        className="shrink-0 text-[13px] font-medium text-foreground underline decoration-foreground/30 decoration-1 underline-offset-4 transition-colors hover:decoration-foreground"
      >
        Conversar com Sofia
      </Link>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dispensar por 24h"
        className="-mr-1 shrink-0 rounded p-1 text-foreground/40 transition-colors hover:text-foreground/80"
      >
        <IconX className="size-3.5" />
      </button>
    </div>
  )
}
