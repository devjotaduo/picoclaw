import {
  IconChevronDown,
  IconChevronUp,
  IconSearch,
  IconX,
} from "@tabler/icons-react"
import { useEffect, useRef } from "react"

import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface ConversationSearchProps {
  open: boolean
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  cursor: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

export function ConversationSearch({
  open,
  query,
  onQueryChange,
  matchCount,
  cursor,
  onPrev,
  onNext,
  onClose,
}: ConversationSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (e.shiftKey) onPrev()
        else onNext()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        onNext()
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        onPrev()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, onNext, onPrev, open])

  if (!open) return null

  return (
    <div
      className="border-border/40 bg-background flex items-center gap-2 border-b px-3 py-2"
      role="search"
      aria-label="Buscar na conversa"
    >
      <IconSearch className="text-foreground/70 size-4 shrink-0" aria-hidden="true" />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar nesta conversa"
        aria-label="Termo de busca"
        className="h-8 flex-1 text-sm"
      />
      <span
        className="text-foreground/60 min-w-14 text-right text-[11px] tabular-nums"
        aria-live="polite"
      >
        {matchCount === 0
          ? query
            ? "Nenhuma"
            : ""
          : `${cursor + 1} de ${matchCount}`}
      </span>
      <div className="flex items-center gap-1">
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onPrev}
              disabled={matchCount === 0}
              className="hover:bg-muted focus-visible:ring-ring flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Resultado anterior"
            >
              <IconChevronUp className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Anterior (Shift+Enter / ↑)</TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onNext}
              disabled={matchCount === 0}
              className="hover:bg-muted focus-visible:ring-ring flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Próximo resultado"
            >
              <IconChevronDown className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Próximo (Enter / ↓)</TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClose}
              className="hover:bg-muted focus-visible:ring-ring flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Fechar busca"
            >
              <IconX className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Esc</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
