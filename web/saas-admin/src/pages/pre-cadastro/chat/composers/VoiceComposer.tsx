import { useEffect, useRef } from "react";
import { Loader2, Mic, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  transcript: string;
  setTranscript: (next: string) => void;
  listening: boolean;
  busy: boolean;
  onStartSpeech: () => void;
  onSubmit: (transcript: string) => void;
  onSkip: () => void;
};

export function VoiceComposer({
  transcript,
  setTranscript,
  listening,
  busy,
  onStartSpeech,
  onSubmit,
  onSkip,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={onStartSpeech}
        disabled={listening || busy}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium",
          "transition-colors hover:bg-zinc-50 disabled:opacity-60",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20",
        )}
        aria-pressed={listening}
      >
        {listening ? (
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        ) : (
          <Mic className="h-5 w-5 text-brand-600" />
        )}
        {listening ? "Ouvindo… fale agora" : "Transcrever fala"}
      </button>

      {listening && (
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="pc-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          Captando fala em português
        </div>
      )}

      <textarea
        ref={ref}
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder="Ou escreva aqui o que explicaria por voz…"
        rows={3}
        className={cn(
          "block w-full resize-y rounded-2xl border border-zinc-200 bg-white p-3 text-[15px] leading-6 text-zinc-900",
          "placeholder:text-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
        )}
        aria-label="Complemento por texto"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="h-11 flex-1 rounded-2xl px-4 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
        >
          Pular
        </button>
        <button
          type="button"
          onClick={() => onSubmit(transcript)}
          disabled={busy}
          className={cn(
            "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm",
            "transition-all active:scale-[0.99] disabled:opacity-60",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
          )}
        >
          <Send className="h-4 w-4" />
          Enviar
        </button>
      </div>
    </div>
  );
}
