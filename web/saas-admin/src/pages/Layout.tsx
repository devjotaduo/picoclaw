import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { LogOut, Users, Briefcase, UserRound, Building2, DollarSign, SlidersHorizontal, ClipboardList, UserCog, LayoutDashboard, FileText, Activity, KeyRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getTenant } from "@/api/tenants";

export type CrmView = "contacts" | "companies" | "deals";

const CRM_VIEWS: { view: CrmView; label: string; icon: React.ReactNode }[] = [
  { view: "contacts", label: "Contacts", icon: <UserRound className="h-3.5 w-3.5" /> },
  { view: "companies", label: "Companies", icon: <Building2 className="h-3.5 w-3.5" /> },
  { view: "deals", label: "Deals", icon: <DollarSign className="h-3.5 w-3.5" /> },
];

export function Layout() {
  const { signOut, status } = useAuth();
  const loc = useLocation();
  const params = useParams<{ id?: string }>();
  const inCrm = loc.pathname.startsWith("/crm");
  const inProfiles = loc.pathname.startsWith("/launcher-profiles");
  const inTenant = loc.pathname.startsWith("/tenants/");
  // When navigating within a tenant route, params.id may not be populated here
  // since Layout renders outside the nested route. Extract id from pathname directly.
  const tenantIdFromPath = inTenant
    ? (loc.pathname.split("/")[2] ?? null)
    : null;
  const tenantId = params.id ?? tenantIdFromPath;

  const tenantQuery = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => getTenant(tenantId!),
    enabled: !!tenantId,
    staleTime: 60_000,
  });
  const tenantData = tenantQuery.data;
  const isPlatformAdmin =
    status.state === "authenticated" && status.me.platform_role === "platform_admin";

  return (
    <div className="flex h-full">
      <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-4 py-4">
          <div className="text-sm font-semibold text-brand-500">Picoclaw SaaS</div>
          <div className="text-xs text-zinc-500">control plane</div>
        </div>
        <nav className="flex-1 py-2">
          {isPlatformAdmin && (
            <SideLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} active={loc.pathname === "/dashboard"}>
              Dashboard
            </SideLink>
          )}
          {isPlatformAdmin && (
            <SideLink to="/server-health" icon={<Activity className="h-4 w-4" />} active={loc.pathname === "/server-health"}>
              Saúde do servidor
            </SideLink>
          )}
          <SideLink to="/tenants" icon={<Users className="h-4 w-4" />} active={loc.pathname.startsWith("/tenants")}>
            Tenants
          </SideLink>

          {tenantId && tenantData && (
            <div className="mx-4 mb-1 truncate rounded bg-zinc-800/50 px-2 py-1 text-[10px] text-zinc-400">
              {tenantData.subdomain}
            </div>
          )}

          {isPlatformAdmin && (
            <SideLink to="/launcher-profiles" icon={<SlidersHorizontal className="h-4 w-4" />} active={inProfiles}>
              Launcher profiles
            </SideLink>
          )}
          {isPlatformAdmin && (
            <SideLink to="/intakes" icon={<FileText className="h-4 w-4" />} active={loc.pathname === "/intakes"}>
              Pré-cadastros
            </SideLink>
          )}
          {isPlatformAdmin && (
            <SideLink to="/audit" icon={<ClipboardList className="h-4 w-4" />} active={loc.pathname === "/audit"}>
              Audit log
            </SideLink>
          )}
          {isPlatformAdmin && (
            <SideLink to="/users" icon={<UserCog className="h-4 w-4" />} active={loc.pathname === "/users"}>
              Users
            </SideLink>
          )}

          {isPlatformAdmin && <div className="mx-4 my-1 h-px bg-zinc-800" />}

          {isPlatformAdmin && (
            <SideLink to="/crm/contacts" icon={<Briefcase className="h-4 w-4" />} active={inCrm}>
              CRM
            </SideLink>
          )}
          {isPlatformAdmin && inCrm && (
            <div className="ml-4 border-l border-zinc-800 pl-2">
              {CRM_VIEWS.map(({ view, label, icon }) => (
                <Link
                  key={view}
                  to={`/crm/${view}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs transition-colors rounded",
                    loc.pathname === `/crm/${view}`
                      ? "text-zinc-100 bg-zinc-800/60"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50",
                  )}
                >
                  {icon}
                  {label}
                </Link>
              ))}
            </div>
          )}
        </nav>
        <div className="border-t border-zinc-800 px-3 py-3 text-xs">
          <div className="mb-2 text-zinc-500">
            {status.state === "authenticated" ? status.me.email : ""}
          </div>
          {status.state === "authenticated" && (
            <div className="mb-2 text-[10px] uppercase text-zinc-600">
              {status.me.platform_role || "tenant user"}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Link
              to="/account/password"
              className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100"
            >
              <KeyRound className="h-3.5 w-3.5" /> Change password
            </Link>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}

function SideLink({
  to,
  icon,
  active,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm transition-colors",
        active
          ? "bg-zinc-900 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
