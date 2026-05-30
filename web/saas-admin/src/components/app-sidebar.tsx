import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  IconActivity,
  IconBriefcase,
  IconClipboardList,
  IconFolder,
  IconLayoutDashboard,
  IconLink,
  IconPlugConnected,
  IconPlus,
  IconSparkles,
  IconUsers,
  IconUserShield,
} from "@tabler/icons-react";

import { getTenant } from "@/api/tenants";
import { StatusBadge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  platformOnly?: boolean;
  match?: (pathname: string) => boolean;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operação",
    items: [
      { label: "Resumo", to: "/dashboard", icon: IconLayoutDashboard, platformOnly: true },
      { label: "Saúde do servidor", to: "/server-health", icon: IconActivity, platformOnly: true },
    ],
  },
  {
    label: "Clientes",
    items: [
      { label: "Clientes", to: "/tenants", icon: IconUsers, match: (p) => p === "/tenants" || (p.startsWith("/tenants/") && p !== "/tenants/discovery" && p !== "/tenants/new") },
      { label: "Novo cliente", to: "/tenants/new", icon: IconPlus, platformOnly: true },
      { label: "Descoberta", to: "/tenants/discovery", icon: IconSparkles, platformOnly: true },
    ],
  },
  {
    label: "Modelos",
    items: [
      { label: "Modelos", to: "/workspaces", icon: IconFolder, platformOnly: true, match: (p) => p.startsWith("/workspaces") },
    ],
  },
  {
    label: "Comercial",
    items: [
      { label: "CRM", to: "/crm/contacts", icon: IconBriefcase, platformOnly: true, match: (p) => p.startsWith("/crm") },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { label: "Links curtos", to: "/shortlinks", icon: IconLink, platformOnly: true },
      { label: "LiteLLM", to: "/platform/litellm", icon: IconPlugConnected, platformOnly: true },
      { label: "Histórico", to: "/audit", icon: IconClipboardList, platformOnly: true },
      { label: "Equipe", to: "/users", icon: IconUserShield, platformOnly: true },
    ],
  },
];

export function AppSidebar() {
  const loc = useLocation();
  const params = useParams<{ id?: string }>();
  const { status } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const isPlatformAdmin =
    status.state === "authenticated" && status.me.platform_role === "platform_admin";
  const tenantIdFromPath = loc.pathname.startsWith("/tenants/")
    ? (loc.pathname.split("/")[2] ?? null)
    : null;
  const tenantId = params.id ?? tenantIdFromPath;
  const tenantQuery = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => getTenant(tenantId!),
    enabled: Boolean(tenantId && tenantId !== "new" && tenantId !== "discovery"),
    staleTime: 60_000,
  });

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Jota Duo">
              <Link to="/tenants" onClick={closeMobile}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <IconSparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Jota Duo</span>
                  <span className="truncate text-xs text-muted-foreground">painel administrativo</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {tenantQuery.data ? (
          <SidebarGroup>
            <SidebarGroupLabel>Cliente aberto</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="mx-2 flex flex-col gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{tenantQuery.data.subdomain}</div>
                  <div className="truncate text-xs text-muted-foreground">{tenantQuery.data.display_name || tenantQuery.data.id}</div>
                </div>
                <StatusBadge status={tenantQuery.data.status} />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {navGroups.map((group) => {
          const items = group.items.filter((item) => !item.platformOnly || isPlatformAdmin);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = item.match ? item.match(loc.pathname) : loc.pathname === item.to;
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link to={item.to} onClick={closeMobile}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <div className="truncate px-2 text-xs text-muted-foreground">
          {status.state === "authenticated" ? status.me.email : ""}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
