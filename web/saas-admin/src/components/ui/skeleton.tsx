import { cn } from "@/lib/utils";

export function SkeletonRow({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <tr className={cn("animate-pulse", className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 rounded bg-zinc-800" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("animate-pulse space-y-3 p-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="h-3 w-24 rounded bg-zinc-800" />
          <div className="h-3 rounded bg-zinc-800" style={{ width: `${40 + (i % 2) * 20}%` }} />
        </div>
      ))}
    </div>
  );
}
