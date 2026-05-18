import {
  IconArrowsHorizontal,
  IconMessageCircle,
  IconX,
} from "@tabler/icons-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DrawerWidth = "compact" | "wide" | "full"

const WIDTH_CLASS: Record<DrawerWidth, string> = {
  compact: "w-full sm:w-[420px]",
  wide: "w-full sm:w-[560px] lg:w-[640px]",
  full: "w-full",
}

const WIDTH_LABEL: Record<DrawerWidth, string> = {
  compact: "Compacto",
  wide: "Amplo",
  full: "Tela cheia",
}

const NEXT_WIDTH: Record<DrawerWidth, DrawerWidth> = {
  compact: "wide",
  wide: "full",
  full: "compact",
}

const STORAGE_KEY = "picoclaw:agent-editor:chat-drawer-width"

function readStoredWidth(): DrawerWidth {
  try {
    if (typeof window === "undefined") return "compact"
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === "wide" || raw === "compact" || raw === "full") return raw
  } catch {
    // ignore
  }
  return "compact"
}

export interface ChatTestDrawerProps {
  open: boolean
  agentName: string
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function ChatTestDrawer({
  open,
  agentName,
  onOpenChange,
  children,
}: ChatTestDrawerProps) {
  const [width, setWidth] = useState<DrawerWidth>("compact")

  useEffect(() => {
    setWidth(readStoredWidth())
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, width)
    } catch {
      // ignore
    }
  }, [width])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null
  return (
    <aside
      role="complementary"
      aria-label={`Chat de teste com ${agentName}`}
      className={cn(
        "border-border/60 bg-background fixed inset-y-0 right-0 z-30 flex flex-col border-l shadow-xl",
        WIDTH_CLASS[width],
      )}
    >
      <header className="border-border/40 flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <IconMessageCircle
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold">Chat de teste · {agentName}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setWidth(NEXT_WIDTH[width])}
            aria-label={`Mudar largura do drawer (atual: ${WIDTH_LABEL[width]})`}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            <IconArrowsHorizontal className="size-3.5" aria-hidden="true" />
            {WIDTH_LABEL[width]}
          </Button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar drawer"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex size-7 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <IconX className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  )
}
