import { cn } from "@/lib/utils";
import type { TenantStatus } from "@/api/tenants";

const styles: Record<TenantStatus, string> = {
  provisioning: "bg-blue-950 text-blue-300 border-blue-900",
  active:       "bg-emerald-950 text-emerald-300 border-emerald-900",
  suspended:    "bg-amber-950 text-amber-300 border-amber-900",
  deleting:     "bg-zinc-900 text-zinc-400 border-zinc-800",
  error:        "bg-red-950 text-red-300 border-red-900",
};

export function StatusBadge({ status }: { status: TenantStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}
