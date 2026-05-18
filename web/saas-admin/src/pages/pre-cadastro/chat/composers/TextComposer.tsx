import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  placeholder: string;
  multiline: boolean;
  optional: boolean;
  busy: boolean;
  initialValue?: string;
  skippable: boolean;
  onSubmit: (value: string) => void;
  onSkip: () => void;
};

export function TextComposer({
  placeholder,
  multiline,
  optional,
  busy,
  initialValue = "",
  skippable,
  onSubmit,
  onSkip,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const canSend = optional || value.trim().length > 0;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    onSubmit(value.trim());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          rows={1}
          enterKeyHint="send"
          inputMode="text"
          placeholder={placeholder}
          aria-label="Sua resposta"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onInput={(event) => {
            const el = event.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          className={cn(
            "flex-1 resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px]",
            "leading-6 text-zinc-900 placeholder:text-zinc-400 transition-colors",
            "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
            "max-h-40 min-h-12",
          )}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          enterKeyHint="send"
          placeholder={placeholder}
          aria-label="Sua resposta"
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            "h-12 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-[15px] text-zinc-900",
            "placeholder:text-zinc-400 transition-colors",
            "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
          )}
        />
      )}

      {skippable && !value.trim() && (
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="h-12 rounded-2xl px-4 text-sm font-medium text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
        >
          Pular
        </button>
      )}

      <button
        type="submit"
        disabled={busy || !canSend}
        aria-label="Enviar resposta"
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm transition-all",
          "active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
          canSend && !busy
            ? "bg-brand-600 text-white hover:bg-brand-700"
            : "bg-zinc-200 text-zinc-500",
        )}
      >
        <Send className="h-5 w-5" />
      </button>
    </form>
  );
}
