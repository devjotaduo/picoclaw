import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_ORDER, STEP_TITLES } from "../constants";
import type { StepKey } from "../types";

type ProgressTrackProps = {
  current: StepKey;
  completedThrough: number;
  draftSavedAt: number | null;
};

export function ProgressTrack({ current, completedThrough, draftSavedAt }: ProgressTrackProps) {
  const currentIndex = STEP_ORDER.indexOf(current);
  const totalSteps = STEP_ORDER.length;
  const progressPct = Math.round(((currentIndex + 1) / totalSteps) * 100);
  const draftAge = useDraftAge(draftSavedAt);

  return (
    <div className="space-y-3" aria-label="Progresso do pré-cadastro">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">
          Passo {currentIndex + 1} de {totalSteps}
        </span>
        <span
          aria-live="polite"
          className={cn(
            "transition-opacity duration-300",
            draftAge ? "opacity-100" : "opacity-0",
          )}
        >
          {draftAge}
        </span>
      </div>

      <div className="relative">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <ol className="grid grid-cols-5 gap-1.5">
        {STEP_ORDER.map((key, index) => {
          const isPast = index < currentIndex || index <= completedThrough;
          const isCurrent = index === currentIndex;
          const title = STEP_TITLES[key].title;
          return (
            <li
              key={key}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-col items-center gap-1 text-center"
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                  "transition-all duration-300",
                  isCurrent && "bg-brand-600 text-white ring-4 ring-brand-500/20 scale-110",
                  !isCurrent && isPast && "bg-brand-100 text-brand-700",
                  !isCurrent && !isPast && "bg-zinc-100 text-zinc-400",
                )}
              >
                {isPast && !isCurrent ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-[10px] leading-tight sm:block",
                  isCurrent ? "font-medium text-zinc-800" : "text-zinc-400",
                )}
              >
                {title}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function useDraftAge(savedAt: number | null): string {
  if (!savedAt) return "";
  const diff = Date.now() - savedAt;
  if (diff < 4000) return "Rascunho salvo agora";
  if (diff < 60_000) return `Rascunho salvo há ${Math.floor(diff / 1000)}s`;
  return `Rascunho salvo há ${Math.floor(diff / 60_000)} min`;
}
