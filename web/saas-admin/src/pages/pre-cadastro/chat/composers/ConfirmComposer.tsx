import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  action: "generate" | "submit";
  busy: boolean;
  onConfirm: () => void;
};

export function ConfirmComposer({ label, action, busy, onConfirm }: Props) {
  const Icon = action === "submit" ? CheckCircle2 : Sparkles;
  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={busy}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-white shadow-sm",
        "transition-all active:scale-[0.99] disabled:opacity-60",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30",
        "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
