import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PrimaryIntent = "next" | "generate" | "submit";

type StickyFooterProps = {
  onBack?: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  primaryIntent: PrimaryIntent;
  primaryDisabled?: boolean;
  primaryTitle?: string;
  busy: boolean;
  helperText?: string;
  showBack: boolean;
};

const intentClasses: Record<PrimaryIntent, string> = {
  next: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
  generate: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
  submit: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
};

const intentIcons: Record<PrimaryIntent, React.ComponentType<{ className?: string }>> = {
  next: ArrowRight,
  generate: FileText,
  submit: CheckCircle2,
};

export function StickyFooter({
  onBack,
  onPrimary,
  primaryLabel,
  primaryIntent,
  primaryDisabled,
  primaryTitle,
  busy,
  helperText,
  showBack,
}: StickyFooterProps) {
  const Icon = intentIcons[primaryIntent];
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-4 border-t border-zinc-100 bg-white/95 px-4 backdrop-blur",
        "pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 sm:-mx-6 sm:px-6",
        "md:rounded-b-3xl",
      )}
    >
      {helperText && (
        <p
          className="mb-2 text-center text-xs text-zinc-500 motion-safe:animate-in motion-safe:fade-in"
          aria-live="polite"
        >
          {helperText}
        </p>
      )}
      <div className="flex items-center gap-2">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className={cn(
              "inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-zinc-600",
              "transition-colors hover:bg-zinc-100 disabled:opacity-50",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20",
            )}
            aria-label="Voltar ao passo anterior"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
        )}
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled || busy}
          title={primaryTitle}
          className={cn(
            "ml-auto inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold",
            "shadow-sm transition-all duration-150 motion-safe:active:scale-[0.98]",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
            "disabled:cursor-not-allowed sm:flex-none sm:min-w-44",
            intentClasses[primaryIntent],
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
          <span>{primaryLabel}</span>
        </button>
      </div>
    </div>
  );
}
