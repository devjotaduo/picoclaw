import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  busy: boolean;
  onStart: () => void;
};

export function IntroComposer({ label, busy, onStart }: Props) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm",
        "transition-all active:scale-[0.99] disabled:opacity-60",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {label}
    </button>
  );
}
