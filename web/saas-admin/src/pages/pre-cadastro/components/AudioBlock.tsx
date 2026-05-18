import { Loader2, Mic } from "lucide-react";
import { TextAreaField } from "./Field";

type AudioBlockProps = {
  transcript: string;
  setTranscript: (value: string) => void;
  onSpeech: () => void;
  listening: boolean;
};

export function AudioBlock({ transcript, setTranscript, onSpeech, listening }: AudioBlockProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Complemento por voz</div>
          <p className="mt-1 text-xs text-zinc-500">A Clara salva somente a transcrição, não o áudio.</p>
        </div>
        <button
          type="button"
          disabled={listening}
          onClick={onSpeech}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
          aria-pressed={listening}
        >
          {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4 text-brand-600" />}
          {listening ? "Ouvindo..." : "Transcrever fala"}
        </button>
      </div>
      {listening && (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          Captando fala em português.
        </div>
      )}
      <TextAreaField
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder="Se preferir, escreva aqui o que explicaria por voz."
        aria-label="Complemento por texto"
      />
    </div>
  );
}
