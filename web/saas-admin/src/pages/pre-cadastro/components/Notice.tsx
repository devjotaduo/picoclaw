import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type NoticeTone = "info" | "warning";

export function Notice({
  tone = "info",
  children,
  onDismiss,
}: {
  tone?: NoticeTone;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pc-slide-up flex items-start gap-2.5 rounded-xl border p-3 text-sm",
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-brand-100 bg-brand-50/60 text-brand-700",
      )}
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "warning" ? "text-amber-700" : "text-brand-600")}
      />
      <div className="flex-1 leading-5">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
        >
          Ok
        </button>
      )}
    </div>
  );
}
