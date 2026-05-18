import { CircleAlert } from "lucide-react";

interface ConfigChangeNoticeProps {
  kind?: "save" | "error";
  title: string;
  description: string;
}

export function ConfigChangeNotice({ kind = "save", title, description }: ConfigChangeNoticeProps) {
  const colors =
    kind === "error"
      ? "border-red-800/60 bg-red-950/40 text-red-200"
      : "border-zinc-800 bg-zinc-900 text-zinc-200";
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${colors}`}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <div className="text-[11px] text-zinc-400">{description}</div>
      </div>
    </div>
  );
}
