import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen className="flex h-dvh flex-col overflow-hidden">
        <AppHeader />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
        <Toaster position="bottom-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
