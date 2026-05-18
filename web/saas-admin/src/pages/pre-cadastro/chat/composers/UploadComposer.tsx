import { useRef } from "react";
import { Loader2, Paperclip, Send } from "lucide-react";
import { uploadKinds } from "../../constants";
import { cn } from "@/lib/utils";

type Props = {
  uploadKind: string;
  setUploadKind: (next: string) => void;
  attachmentsCount: number;
  busy: boolean;
  onUpload: (file: File) => void;
  onContinue: () => void;
};

export function UploadComposer({
  uploadKind,
  setUploadKind,
  attachmentsCount,
  busy,
  onUpload,
  onContinue,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Tipo do material
          <select
            value={uploadKind}
            onChange={(event) => setUploadKind(event.target.value)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          >
            {uploadKinds.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 p-5 text-sm text-zinc-700",
          "transition-colors hover:border-brand-400 hover:bg-brand-50/50",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15",
          "disabled:opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        ) : (
          <Paperclip className="h-5 w-5 text-brand-600" />
        )}
        <span className="font-medium">
          {attachmentsCount > 0 ? "Enviar outro arquivo" : "Toque para enviar arquivo"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.doc,.docx,.txt"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={onContinue}
        disabled={busy}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm",
          "transition-all active:scale-[0.99] disabled:opacity-60",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
        )}
      >
        <Send className="h-4 w-4" />
        {attachmentsCount > 0 ? "Continuar" : "Seguir sem material"}
      </button>
    </div>
  );
}
