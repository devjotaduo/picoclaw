import { IconBolt } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import {
  type QuickReply,
  renderQuickReply,
  searchQuickReplies,
} from "@/lib/whatsapp/quick-replies"

export interface QuickRepliesPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Substring typed after the leading "/" (e.g. "ola"). */
  query: string
  /** Replaces the composer content with the rendered template. */
  onPick: (rendered: string) => void
  /** Anchor element the popover should attach to (typically the textarea). */
  anchor: React.ReactNode
  /** Substitution variables — currently just {name}. */
  contactName?: string
}

export function QuickRepliesPopover({
  open,
  onOpenChange,
  query,
  onPick,
  anchor,
  contactName,
}: QuickRepliesPopoverProps) {
  const results = useMemo(() => searchQuickReplies(query), [query])
  const [active, setActive] = useState(0)

  useEffect(() => {
    setActive(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((a) => (results.length === 0 ? 0 : (a + 1) % results.length))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((a) =>
          results.length === 0 ? 0 : (a - 1 + results.length) % results.length,
        )
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (results.length === 0) return
        e.preventDefault()
        const reply = results[active] ?? results[0]!
        onPick(renderQuickReply(reply, { name: contactName }))
        onOpenChange(false)
      } else if (e.key === "Escape") {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [active, contactName, onOpenChange, onPick, open, results])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor as React.ReactElement}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[360px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-border/40 flex items-center gap-1.5 border-b px-3 py-2 text-[11px]">
          <IconBolt className="text-primary size-3.5" aria-hidden="true" />
          <span className="text-foreground/60">
            Respostas rápidas — digite após
          </span>
          <kbd className="bg-muted ring-border rounded px-1.5 py-0.5 font-mono text-[10px] ring-1">
            /
          </kbd>
        </div>
        {results.length === 0 ? (
          <div className="text-foreground/70 px-3 py-4 text-[12px]">
            Nenhuma resposta corresponde a “/{query}”.
          </div>
        ) : (
          <ul
            className="max-h-72 overflow-y-auto py-1"
            role="listbox"
            aria-label="Respostas rápidas"
          >
            {results.map((reply, idx) => {
              const isActive = idx === active
              return (
                <li key={reply.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(renderQuickReply(reply, { name: contactName }))
                      onOpenChange(false)
                    }}
                    onMouseEnter={() => setActive(idx)}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-primary/8" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <kbd className="bg-muted ring-border rounded px-1.5 py-0.5 font-mono text-[10px] ring-1">
                        /{reply.shortcut}
                      </kbd>
                      <span className="text-[11px] font-semibold">
                        {reply.title}
                      </span>
                    </div>
                    <span className="text-foreground/65 line-clamp-2 text-xs">
                      {renderQuickReplyPreview(reply, contactName)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function renderQuickReplyPreview(reply: QuickReply, name?: string): string {
  return renderQuickReply(reply, { name })
}
