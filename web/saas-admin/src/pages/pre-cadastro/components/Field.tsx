import { forwardRef, useId } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldShellProps = {
  label: string;
  hint?: string;
  error?: string;
  showValid?: boolean;
  optional?: boolean;
  children: (ids: { inputId: string; describedBy?: string }) => React.ReactNode;
};

export function FieldShell({ label, hint, error, showValid, optional, children }: FieldShellProps) {
  const reactId = useId();
  const inputId = `pre-${reactId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-zinc-800"
        >
          {label}
          {optional && (
            <span className="ml-1.5 text-xs font-normal text-zinc-400">(opcional)</span>
          )}
        </label>
        {showValid && !error && (
          <CheckCircle2
            aria-hidden
            className="h-4 w-4 text-emerald-600 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50"
          />
        )}
      </div>
      {children({ inputId, describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-xs font-medium text-red-700 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
        >
          <AlertCircle aria-hidden className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  showValid?: boolean;
  optional?: boolean;
};

export const TextField = forwardRef<HTMLInputElement, TextInputProps>(function TextField(
  { label, hint, error, showValid, optional, className, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} showValid={showValid} optional={optional}>
      {({ inputId, describedBy }) => (
        <input
          {...rest}
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            "block w-full rounded-xl border bg-white px-4 text-base text-zinc-900",
            "h-12 placeholder:text-zinc-400 transition-colors duration-150",
            "focus:outline-none focus:ring-4 focus:ring-brand-500/15",
            error
              ? "border-red-400 focus:border-red-500"
              : "border-zinc-200 hover:border-zinc-300 focus:border-brand-500",
            className,
          )}
        />
      )}
    </FieldShell>
  );
});

type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaField(
  { label, hint, error, optional, className, value, ...rest },
  ref,
) {
  // Stand-alone fallback when no label is given (used inline by some steps)
  if (!label) {
    return (
      <textarea
        {...rest}
        ref={ref}
        value={value === "<nil>" ? "" : (value as string)}
        className={cn(
          "block min-h-28 w-full rounded-xl border border-zinc-200 bg-white p-4 text-base text-zinc-900",
          "placeholder:text-zinc-400 transition-colors duration-150",
          "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
          className,
        )}
      />
    );
  }
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {({ inputId, describedBy }) => (
        <textarea
          {...rest}
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          value={value === "<nil>" ? "" : (value as string)}
          className={cn(
            "block min-h-28 w-full rounded-xl border bg-white p-4 text-base text-zinc-900",
            "placeholder:text-zinc-400 transition-colors duration-150 leading-6",
            "focus:outline-none focus:ring-4 focus:ring-brand-500/15",
            error
              ? "border-red-400 focus:border-red-500"
              : "border-zinc-200 hover:border-zinc-300 focus:border-brand-500",
            className,
          )}
        />
      )}
    </FieldShell>
  );
});
