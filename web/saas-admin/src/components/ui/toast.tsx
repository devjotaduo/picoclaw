import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  toast: (opts: { type: ToastType; message: string }) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(({ type, message }: { type: ToastType; message: string }) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // animate in
    requestAnimationFrame(() => setVisible(true));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />,
    info: <Info className="h-4 w-4 text-brand-500 shrink-0" />,
  };

  const bg: Record<ToastType, string> = {
    success: "bg-zinc-900 border-emerald-800/50",
    error: "bg-zinc-900 border-red-800/50",
    info: "bg-zinc-900 border-zinc-700",
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg text-sm text-zinc-100 transition-all duration-300",
        bg[toast.type],
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      {icons[toast.type]}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        type="button"
        className="text-zinc-500 hover:text-zinc-200 transition-colors"
        onClick={() => onDismiss(toast.id)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(Ctx);
}
