import { ArrowLeft, Bot, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatHeaderProps = {
  status: "idle" | "typing" | "busy";
  canGoBack: boolean;
  onBack: () => void;
  draftSavedAt: number | null;
};

export function ChatHeader({ status, canGoBack, onBack, draftSavedAt }: ChatHeaderProps) {
  const subtitle = useStatusLabel(status, draftSavedAt);
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-zinc-200/70 bg-white/85 backdrop-blur-md",
        "pt-[max(env(safe-area-inset-top),0px)]",
      )}
    >
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Voltar para a pergunta anterior"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-zinc-600 transition-colors",
            "hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20",
          )}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Bot className="h-5 w-5" />
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-[2px] border-white bg-emerald-500"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-tight text-zinc-950">Clara</div>
            <div
              aria-live="polite"
              className={cn(
                "truncate text-[11px] leading-tight transition-colors",
                status === "typing" ? "text-brand-600" : "text-zinc-500",
              )}
            >
              {subtitle}
            </div>
          </div>
        </div>

        <div
          className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 sm:flex"
          title="Conversa privada — rascunho salvo automaticamente"
        >
          <ShieldCheck className="h-3 w-3" />
          Privado
        </div>
      </div>
    </header>
  );
}

function useStatusLabel(status: ChatHeaderProps["status"], draftSavedAt: number | null): string {
  if (status === "typing") return "digitando…";
  if (status === "busy") return "salvando…";
  if (!draftSavedAt) return "online";
  const diff = Date.now() - draftSavedAt;
  if (diff < 4000) return "rascunho salvo agora";
  if (diff < 60_000) return `rascunho salvo há ${Math.floor(diff / 1000)}s`;
  return `rascunho salvo há ${Math.floor(diff / 60_000)} min`;
}
