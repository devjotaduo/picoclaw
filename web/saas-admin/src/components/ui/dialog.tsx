import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Minimal modal — no Radix dep. Escape key + backdrop close, focus is left to the caller.

export function Dialog({
  open,
  onClose,
  title,
  children,
  size = "md",
  closable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  closable?: boolean;
}) {
  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, closable]);

  if (!open) return null;
  const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closable ? onClose : undefined}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn("w-full rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl", widths[size])}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {closable && (
            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
