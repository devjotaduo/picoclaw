import { FileText, Paperclip, Upload } from "lucide-react";
import { uploadKinds } from "../constants";
import { cn } from "@/lib/utils";

type UploadDropzoneProps = {
  uploadKind: string;
  setUploadKind: (value: string) => void;
  onUpload: (file: File | null) => void;
  attachments: { id: string; name: string; kind: string }[];
  disabled?: boolean;
};

export function UploadDropzone({
  uploadKind,
  setUploadKind,
  onUpload,
  attachments,
  disabled,
}: UploadDropzoneProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Paperclip aria-hidden className="h-4 w-4 text-zinc-500" />
            Material de apoio
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              Opcional
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Pule se não tiver arquivo pronto agora.</p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Tipo
          <select
            className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
            value={uploadKind}
            onChange={(event) => setUploadKind(event.target.value)}
            aria-label="Tipo do material"
          >
            {uploadKinds.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <label
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed",
          "border-zinc-200 bg-zinc-50/60 p-6 text-center text-sm text-zinc-600 transition-colors",
          "hover:border-brand-400 hover:bg-brand-50/40",
          "focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15",
        )}
      >
        <Upload aria-hidden className="h-5 w-5 text-brand-600 transition-transform group-hover:-translate-y-0.5" />
        <span className="font-medium text-zinc-800">Toque para enviar arquivo</span>
        <span className="text-xs text-zinc-500">PDF, planilha, imagem ou documento (até 20 MB)</span>
        <input
          className="sr-only"
          type="file"
          disabled={disabled}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.doc,.docx,.txt"
          onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
        />
      </label>

      {attachments.length > 0 && (
        <ul className="space-y-1.5 text-sm text-zinc-700">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2"
            >
              <FileText aria-hidden className="h-4 w-4 text-emerald-700" />
              <span className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                {attachment.kind}
              </span>
              <span className="truncate text-sm text-zinc-700">{attachment.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
