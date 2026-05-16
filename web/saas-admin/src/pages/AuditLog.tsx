import { useQuery } from "@tanstack/react-query";
import { getAuditLog } from "@/api/audit";
import { SkeletonRow } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/utils";

export function AuditLog() {
  const q = useQuery({ queryKey: ["audit"], queryFn: () => getAuditLog(200), staleTime: 30_000 });
  const entries = q.data?.audit ?? [];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-xs text-zinc-500">Last {entries.length} platform actions</p>
      </header>

      {q.isError && (
        <div className="rounded bg-red-950/50 p-3 text-xs text-red-300">Failed to load audit log.</div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900/80 text-left text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Tenant</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {q.isLoading && (
              <>
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
              </>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-1.5 text-zinc-500 whitespace-nowrap">{relativeTime(e.created_at)}</td>
                <td className="px-3 py-1.5 text-zinc-400">{e.actor_email ?? "—"}</td>
                <td className="px-3 py-1.5 font-mono text-zinc-500 text-[10px]">
                  {e.tenant_id ? e.tenant_id.slice(0, 8) + "…" : "—"}
                </td>
                <td className="px-3 py-1.5 text-zinc-200">{e.action}</td>
                <td className="px-3 py-1.5 text-zinc-500">
                  {e.target_type ? `${e.target_type}${e.target_id ? ` #${e.target_id}` : ""}` : "—"}
                </td>
              </tr>
            ))}
            {!q.isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-600">No audit entries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
