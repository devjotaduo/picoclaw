import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  IconKey,
  IconLayoutSidebar,
  IconLogout,
  IconRefresh,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader() {
  const { signOut, status } = useAuth();
  const qc = useQueryClient();
  const email = status.state === "authenticated" ? status.me.email : "";
  const role =
    status.state === "authenticated"
      ? status.me.platform_role || "tenant user"
      : "";

  return (
    <header className="supports-backdrop-filter:bg-background/60 sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-background/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <Tooltip delayDuration={700}>
          <TooltipTrigger asChild>
            <SidebarTrigger className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground [&>svg]:size-5">
              <IconLayoutSidebar />
            </SidebarTrigger>
          </TooltipTrigger>
          <TooltipContent>Alternar navegação</TooltipContent>
        </Tooltip>
        <Link to="/tenants" className="hidden shrink-0 items-center gap-2 sm:flex">
          <img className="size-8 rounded-md object-contain" src="/jota-duo-logo.png" alt="" />
          <span className="text-sm font-semibold text-foreground">Picoclaw</span>
        </Link>
        <Separator orientation="vertical" className="mx-2 hidden h-6 md:block" />
        <span className="hidden text-xs font-medium text-muted-foreground md:inline">
          SaaS Control Plane
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip delayDuration={700}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Atualizar dados"
              onClick={() => void qc.invalidateQueries()}
            >
              <IconRefresh />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Atualizar dados</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-[220px]">
              <span className="truncate">{email || "Conta"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="truncate text-sm font-medium">{email}</span>
                <span className="text-xs text-muted-foreground">{role}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account/password">
                <IconKey data-icon="inline-start" />
                Change password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>
              <IconLogout data-icon="inline-start" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
