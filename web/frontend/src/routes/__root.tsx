import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { useEffect, useState } from "react"
import { Toaster } from "sonner"

import { getLauncherAuthStatus } from "@/api/launcher-auth"
import { AppHeader } from "@/components/app-header"
import { AppLayout } from "@/components/app-layout"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
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
      (m) => m.routeId === "/launcher-login" || m.routeId === "/launcher-setup",
    )

  const [authError, setAuthError] = useState<string | null>(null)

  // Waiting/public tenants are anonymous surfaces. Wait for the real
  // ui-visibility.json before deciding, because the frontend fallback resolves
  // to "public" when no launcher policy is available yet.
  const uiVisibility = useUIVisibility()
  const isAnonymousTenantProfile =
    !uiVisibility.isLoading &&
    !uiVisibility.isError &&
    (uiVisibility.profile === "public" || uiVisibility.profile === "waiting")
  const isWaiting = uiVisibility.profile === "waiting"
  const showAnonymousHeader = uiVisibility.visible(
    "header.visible",
    uiVisibility.visible("header.actions", false),
  )

  // Session guard: proactively check auth status on every page load.
  useEffect(() => {
    if (isPublicPage || uiVisibility.isLoading || isAnonymousTenantProfile) {
      return
    }
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
  }, [isAnonymousTenantProfile, isPublicPage, uiVisibility.isLoading])

  useEffect(() => {
    if (isPublicPage || uiVisibility.isLoading) {
      return
    }
    initializeChatStore({ hydrateHistory: !isAnonymousTenantProfile })
  }, [isAnonymousTenantProfile, isPublicPage, uiVisibility.isLoading])

  // Anonymous tenant surfaces may skip the normal authenticated AppLayout, so
  // force the app's default dark theme before rendering public chat/waiting UI.
  // The index.html bootstrap script handles the pre-paint default.
  useEffect(() => {
    if (isAnonymousTenantProfile || isWaiting) {
      document.documentElement.classList.add("dark")
    }
  }, [isAnonymousTenantProfile, isWaiting])

  // Waiting screen: quando o tenant terminou o discovery e está aguardando
  // contato/liberação do admin, ui-visibility.json tem active_profile="waiting".
  // Renderiza overlay fullscreen com mensagem fixa em vez do app inteiro.
  // Funciona ANTES de qualquer outra UI — inclui páginas públicas (chat
  // anônimo), porque o cliente chega lá pela URL do tenant dele.
  if (isWaiting) {
    return <WaitingScreen />
  }

  if (!isPublicPage && uiVisibility.isLoading) {
    return (
      <TooltipProvider>
        <div className="bg-background min-h-screen" />
        <Toaster position="bottom-center" />
      </TooltipProvider>
    )
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

  if (isAnonymousTenantProfile) {
    return (
      <TooltipProvider>
        <SidebarProvider
          defaultOpen={false}
          className="bg-background flex h-dvh flex-col overflow-hidden"
        >
          {showAnonymousHeader ? <AppHeader /> : null}
          <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
          <Toaster position="bottom-center" />
          {import.meta.env.DEV ? (
            <TanStackRouterDevtools position="bottom-right" />
          ) : null}
        </SidebarProvider>
      </TooltipProvider>
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
