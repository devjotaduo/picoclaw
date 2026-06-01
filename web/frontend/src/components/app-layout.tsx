import type { ReactNode } from "react"
import { Toaster } from "sonner"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { OnboardingBanner } from "@/components/onboarding-banner"
import { RightRail } from "@/components/right-rail/right-rail"
import { TourGuide } from "@/components/tour/tour-guide"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppLayout({ children }: { children: ReactNode }) {
  const defaultSidebarOpen =
    typeof globalThis.location === "undefined"
      ? true
      : globalThis.location.pathname !== "/agent/whatsapp"

  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={defaultSidebarOpen}
        className="flex h-dvh flex-col overflow-hidden"
      >
        <AppHeader />

        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <div className="flex w-full min-w-0 flex-col overflow-hidden">
            <OnboardingBanner />
            <main className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
              {children}
            </main>
          </div>
          {/* Terceira coluna persistente: notificações, handoffs, leads e
              pendências que os agentes já produzem. Gated por
              layout.right_rail (oculto em public/waiting). */}
          <RightRail />
        </div>
        <Toaster position="bottom-center" />
        <TourGuide />
      </SidebarProvider>
    </TooltipProvider>
  )
}
