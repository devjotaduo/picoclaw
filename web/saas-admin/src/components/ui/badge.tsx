import { cn } from "@/lib/utils";
import type { TenantStatus } from "@/api/tenants";
import type { HTMLAttributes } from "react";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

const styles: Record<TenantStatus, string> = {
  provisioning: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  active:       "border-chart-2/30 bg-chart-2/10 text-chart-2",
  suspended:    "border-chart-3/30 bg-chart-3/10 text-chart-3",
  deleting:     "border-border bg-muted text-muted-foreground",
  error:        "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: TenantStatus }) {
  return (
    <Badge
      className={cn(
        "rounded-full text-[10px] uppercase tracking-wide",
        styles[status],
      )}
    >
      {status}
    </Badge>
  );
}
