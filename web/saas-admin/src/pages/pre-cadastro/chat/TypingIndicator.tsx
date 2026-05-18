import { Bot } from "lucide-react";

export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Clara está digitando"
      className="pc-slide-up flex items-end gap-2"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2.5">
        <Dot delayMs={0} />
        <Dot delayMs={160} />
        <Dot delayMs={320} />
      </div>
    </div>
  );
}

function Dot({ delayMs }: { delayMs: number }) {
  return (
    <span
      aria-hidden
      className="pc-typing-dot block h-1.5 w-1.5 rounded-full bg-zinc-400"
      style={{ animationDelay: `${delayMs}ms` }}
    />
  );
}
