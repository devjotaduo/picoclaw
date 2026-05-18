import { useState } from "react";
import { Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toStringArray } from "../../helpers";

type Props = {
  options: string[];
  min: number;
  storedAnswerKey: string;
  storedAnswers: Record<string, unknown>;
  onToggleStore: (key: string, value: string) => void;
  busy: boolean;
  skippable: boolean;
  onSubmit: (values: string[]) => void;
  onSkip: () => void;
};

export function ChipsComposer({
  options,
  min,
  storedAnswerKey,
  storedAnswers,
  onToggleStore,
  busy,
  skippable,
  onSubmit,
  onSkip,
}: Props) {
  // Source of truth = parent answers; we just read from there.
  const selected = toStringArray(storedAnswers[storedAnswerKey]);
  const [touched, setTouched] = useState(false);
  const canSend = selected.length >= min;
  const showError = touched && !canSend;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Opções" className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setTouched(true);
                onToggleStore(storedAnswerKey, option);
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium",
                "transition-all duration-150 active:scale-[0.97]",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20",
                active
                  ? "border-brand-600 bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50",
              )}
            >
              <Check
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5 transition-all duration-150",
                  active ? "scale-100 opacity-100" : "-ml-1 w-0 scale-0 opacity-0",
                )}
              />
              <span>{option}</span>
            </button>
          );
        })}
      </div>

      {showError && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {min === 1 ? "Selecione pelo menos uma opção." : `Selecione pelo menos ${min} opções.`}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {selected.length > 0
            ? `${selected.length} selecionada${selected.length > 1 ? "s" : ""}`
            : "Toque para selecionar"}
        </p>
        <div className="flex items-center gap-2">
          {skippable && selected.length === 0 && (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              className="h-11 rounded-2xl px-4 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
            >
              Pular
            </button>
          )}
          <button
            type="button"
            disabled={busy || !canSend}
            onClick={() => {
              setTouched(true);
              if (!canSend) return;
              onSubmit(selected);
            }}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-all",
              "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
              canSend ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-zinc-200 text-zinc-500",
            )}
          >
            <Send className="h-4 w-4" />
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
