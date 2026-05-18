import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { deleteTenant, listTenants, type Tenant } from "@/api/tenants";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { relativeTime, formatUSD } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";

type TenantStatus = "all" | "active" | "suspended" | "error" | "provisioning" | "deleting";

const VALID_STATUSES: TenantStatus[] = ["all", "active", "suspended", "error", "provisioning", "deleting"];

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "error", label: "Error" },
  { value: "provisioning", label: "Provisioning" },
  { value: "deleting", label: "Deleting" },
];

function isValidStatus(v: string | null): v is TenantStatus {
  return v !== null && (VALID_STATUSES as string[]).includes(v);
}

export function TenantsList() {
  const { status } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = useQuery({ queryKey: ["tenants"], queryFn: listTenants, refetchInterval: 15_000 });
  const tenants = q.data?.tenants ?? [];
  const isPlatformAdmin =
    status.state === "authenticated" && status.me.platform_role === "platform_admin";

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const deleteM = useMutation({
    mutationFn: (tenant: Tenant) => deleteTenant(tenant.id),
    onSuccess: async (_res, tenant) => {
      setDeleteTarget(null);
      setDeleteConfirm("");
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      toast({ type: "success", message: `${tenant.subdomain} deleted.` });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to delete tenant." }),
  });

  // Read status filter from URL; fall back to "all"
  const rawStatus = searchParams.get("status");
  const statusFilter: TenantStatus = isValidStatus(rawStatus) ? rawStatus : "all";

  const filtered = tenants.filter((t) => {
    const term = search.toLowerCase();
    const matchSearch =
      !term ||
      t.subdomain.includes(term) ||
      t.owner_email.toLowerCase().includes(term) ||
      (t.display_name?.toLowerCase().includes(term) ?? false);
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleStatusFilterChange = (value: TenantStatus) => {
    setSearchParams(value === "all" ? {} : { status: value }, { replace: true });
  };

  const closeDeleteDialog = () => {
    if (deleteM.isPending) return;
    setDeleteTarget(null);
    setDeleteConfirm("");
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tenants</h1>
          <p className="text-xs text-zinc-500">
            {q.isLoading ? "Loading…" : filtered.length === tenants.length
              ? `${tenants.length} total`
              : `${filtered.length} of ${tenants.length}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={q.isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
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

      {/* Search + filter bar */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by subdomain, email or name…"
            className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value as TenantStatus)}
          className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-brand-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

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

      {!q.isLoading && tenants.length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-zinc-800 p-6 text-center text-sm text-zinc-500">
          No tenants match your filter.
          <button
            className="ml-2 text-xs text-brand-500 hover:underline"
            onClick={() => { setSearch(""); setSearchParams({}, { replace: true }); }}
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Subdomain</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Budget/mo</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Delivered?</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {q.isLoading && (
              <>
                <SkeletonRow cols={8} />
                <SkeletonRow cols={8} />
                <SkeletonRow cols={8} />
                <SkeletonRow cols={8} />
                <SkeletonRow cols={8} />
              </>
            )}
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="cursor-pointer hover:bg-zinc-900/40"
                onClick={() => nav(`/tenants/${t.id}`)}
              >
                <td className="px-3 py-2">
                  <Link
                    className="font-medium text-brand-500 hover:underline"
                    to={`/tenants/${t.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t.subdomain}
                  </Link>
                  <div className="text-[10px] text-zinc-600">{t.id}</div>
                </td>
                <td className="px-3 py-2 text-zinc-300">{t.display_name || "—"}</td>
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
                <td className="px-3 py-2 text-right">
                  {isPlatformAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-red-300"
                      aria-label={`Delete ${t.subdomain}`}
                      title={`Delete ${t.subdomain}`}
                      disabled={t.status === "deleting"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(t);
                        setDeleteConfirm("");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!deleteTarget} onClose={closeDeleteDialog} title="Delete tenant?" size="sm" closable={!deleteM.isPending}>
        {deleteTarget && (
          <div className="space-y-4 text-sm">
            <p className="text-zinc-300">
              This removes the Docker container, LiteLLM key, tenant volume, and related Picoclaw database records.
            </p>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Type {deleteTarget.subdomain}</label>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-red-500"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDeleteDialog} disabled={deleteM.isPending}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => deleteM.mutate(deleteTarget)}
                disabled={deleteConfirm !== deleteTarget.subdomain || deleteM.isPending}
              >
                {deleteM.isPending ? "Deleting…" : "Delete forever"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
