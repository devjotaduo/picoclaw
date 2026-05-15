import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { listTenants } from "@/api/tenants";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { relativeTime, formatUSD } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function TenantsList() {
  const { status } = useAuth();
  const q = useQuery({ queryKey: ["tenants"], queryFn: listTenants, refetchInterval: 15_000 });
  const tenants = q.data?.tenants ?? [];
  const isPlatformAdmin =
    status.state === "authenticated" && status.me.platform_role === "platform_admin";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tenants</h1>
          <p className="text-xs text-zinc-500">{tenants.length} total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {isPlatformAdmin && (
            <Link to="/tenants/new">
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> New tenant
              </Button>
            </Link>
          )}
        </div>
      </header>

      {q.isLoading && <div className="text-sm text-zinc-500">Loading…</div>}
      {q.isError && (
        <div className="rounded bg-red-950/50 p-3 text-xs text-red-300">Failed to load tenants.</div>
      )}

      {!q.isLoading && tenants.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          No tenants yet.
          <div className="mt-3">
            {isPlatformAdmin && (
              <Link to="/tenants/new">
                <Button size="sm">Create the first one</Button>
              </Link>
            )}
          </div>
        </div>
      )}

      {tenants.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Subdomain</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Budget/mo</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Delivered?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-2">
                    <Link className="font-medium text-brand-500 hover:underline" to={`/tenants/${t.id}`}>
                      {t.subdomain}
                    </Link>
                    <div className="text-[10px] text-zinc-600">{t.id}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{t.owner_email}</td>
                  <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                  <td className="px-3 py-2 text-zinc-400">{formatUSD(t.monthly_budget_usd)}</td>
                  <td className="px-3 py-2 text-zinc-500">{relativeTime(t.created_at)}</td>
                  <td className="px-3 py-2">
                    {t.initial_password_delivered ? (
                      <span className="text-xs text-emerald-400">yes</span>
                    ) : (
                      <span className="text-xs text-amber-400">pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
