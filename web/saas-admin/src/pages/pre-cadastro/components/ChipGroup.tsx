import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type ChipGroupProps = {
  label?: string;
  description?: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  ariaLabel?: string;
};

export function ChipGroup({ label, description, values, selected, onToggle, ariaLabel }: ChipGroupProps) {
  const content = (
    <div role="group" aria-label={ariaLabel ?? label} className="flex flex-wrap gap-2">
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(value)}
            className={cn(
              "group inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium",
              "transition-all duration-150 motion-safe:active:scale-[0.97]",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20",
              active
                ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50",
            )}
          >
            <Check
              aria-hidden
              className={cn(
                "h-3.5 w-3.5 transition-all duration-150",
                active ? "scale-100 opacity-100" : "-ml-1 w-0 scale-0 opacity-0",
              )}
            />
            <span>{value}</span>
          </button>
        );
      })}
    </div>
  );

  if (!label) return content;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-zinc-900">
        {label}
        {description && (
          <span className="ml-2 text-xs font-normal text-zinc-500">{description}</span>
        )}
      </legend>
      {content}
    </fieldset>
  );
}
