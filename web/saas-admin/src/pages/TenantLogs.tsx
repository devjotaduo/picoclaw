import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getTenantLogs } from "@/api/tenants";

export function TenantLogs() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["tenant-logs", id],
    queryFn: () => getTenantLogs(id, 300),
    refetchInterval: 10_000,
  });
  const lines = q.data?.lines ?? [];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Link
            to={`/tenants/${id}`}
            className="-ml-2 mb-2 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-xl font-semibold">Tenant logs</h1>
          <p className="font-mono text-xs text-zinc-500">{id}</p>
        </div>
      </header>

      {q.isError && (
        <div className="mb-4 rounded bg-red-950/50 p-3 text-xs text-red-300">
          Failed to load tenant logs.
        </div>
      )}

      <pre className="min-h-[60vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300">
        {q.isLoading ? "Loading logs..." : lines.length > 0 ? lines.join("\n") : "No logs available."}
      </pre>
    </div>
  );
}
