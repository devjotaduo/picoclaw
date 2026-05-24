import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { useEffect, useState } from "react"

import { getLauncherAuthStatus } from "@/api/launcher-auth"
import { AppLayout } from "@/components/app-layout"
import { WaitingScreen } from "@/components/waiting-screen"
import { initializeChatStore } from "@/features/chat/controller"
import { useUIVisibility } from "@/hooks/use-ui-visibility"
import { isLauncherPublicPathname } from "@/lib/launcher-login-path"

const RootLayout = () => {
  // Prefer the real address bar path: stale embedded bundles may not register
  // /launcher-login or /launcher-setup in the route tree, which would otherwise
  // keep AppLayout + gateway polling → 401 → launcherFetch redirect loop.
  const routerState = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      matches: s.matches,
    }),
  })

  const windowPath =
    typeof globalThis.location !== "undefined"
      ? globalThis.location.pathname || "/"
      : routerState.pathname

  const isPublicPage =
    isLauncherPublicPathname(windowPath) ||
    isLauncherPublicPathname(routerState.pathname) ||
    routerState.matches.some(
      (m) =>
        m.routeId === "/launcher-login" ||
        m.routeId === "/launcher-setup" ||
        m.routeId === "/sofia-onboarding",
    )

  const [authError, setAuthError] = useState<string | null>(null)

  // Session guard: proactively check auth status on every page load.
  useEffect(() => {
    if (isPublicPage) return
    void getLauncherAuthStatus()
      .then((s) => {
        if (!s.initialized) {
          globalThis.location.assign("/launcher-setup")
        } else if (!s.authenticated) {
          globalThis.location.assign("/launcher-login")
        }
      })
      .catch((err: unknown) => {
        // On 401/403, redirect to login — the session is invalid.
        // On 5xx (e.g. 503 when the auth store is unavailable) or network errors,
        // do NOT redirect: a subsequent successful login would loop straight back here.
        // launcherFetch handles 401 on real API calls regardless.
        if (err instanceof Error && /^status 40[13]$/.test(err.message)) {
          globalThis.location.assign("/launcher-login")
        } else {
          setAuthError(
            err instanceof Error
              ? err.message
              : "Auth service unavailable. Reset dashboard password storage and restart the application.",
          )
        }
      })
  }, [isPublicPage])

  useEffect(() => {
    if (isPublicPage) {
      return
    }
    initializeChatStore()
  }, [isPublicPage])

  // Waiting screen: quando o tenant terminou o discovery e está aguardando
  // contato/liberação do admin, ui-visibility.json tem active_profile="waiting".
  // Renderiza overlay fullscreen com mensagem fixa em vez do app inteiro.
  // Funciona ANTES de qualquer outra UI — inclui páginas públicas (chat
  // anônimo), porque o cliente chega lá pela URL do tenant dele.
  const uiVisibility = useUIVisibility()
  const isWaiting = uiVisibility.profile === "waiting"

  if (isWaiting) {
    return <WaitingScreen />
  }

  if (isPublicPage) {
    return (
      <>
        <Outlet />
        {import.meta.env.DEV ? (
          <TanStackRouterDevtools position="bottom-right" />
        ) : null}
      </>
    )
  }

  return (
    <>
      {authError && (
        <div className="bg-destructive text-destructive-foreground fixed inset-x-0 top-0 z-[100] flex items-center justify-between px-4 py-2 text-sm shadow-md">
          <span>Auth service error: {authError}</span>
          <button
            className="ml-4 opacity-70 hover:opacity-100"
            onClick={() => setAuthError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <AppLayout>
        <Outlet />
        {import.meta.env.DEV ? (
          <TanStackRouterDevtools position="bottom-right" />
        ) : null}
      </AppLayout>
    </>
  )
}

export const Route = createRootRoute({ component: RootLayout })
