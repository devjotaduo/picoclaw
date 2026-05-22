export interface TypingIndicatorProps {
  /** Optional name to render before the dots ("Brendo está digitando"). */
  name?: string
  className?: string
}

/**
 * "Digitando…" indicator. The three dots are pure CSS via animate-bounce
 * with staggered delays — no extra dep, no canvas.
 */
export function TypingIndicator({
  name,
  className = "",
}: TypingIndicatorProps) {
  return (
    <span
      className={`text-foreground/70 inline-flex items-center gap-1 text-[11px] ${className}`}
      role="status"
      aria-live="polite"
    >
      {name ? (
        <span className="truncate">{name} está digitando</span>
      ) : (
        <span>digitando</span>
      )}
      <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
        <span className="bg-foreground/60 size-[3px] animate-bounce rounded-full [animation-delay:-0.32s]" />
        <span className="bg-foreground/60 size-[3px] animate-bounce rounded-full [animation-delay:-0.16s]" />
        <span className="bg-foreground/60 size-[3px] animate-bounce rounded-full" />
      </span>
    </span>
  )
}
