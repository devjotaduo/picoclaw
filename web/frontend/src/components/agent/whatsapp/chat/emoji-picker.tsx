import { IconMoodSmile } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EMOJI_CATEGORIES } from "@/lib/whatsapp/emoji-catalog"

export interface EmojiPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (emoji: string) => void
}

/**
 * Lightweight emoji picker built on a static catalog (no emoji-mart dep).
 * The keyboard ":" shortcut is wired by the parent — this component only
 * renders the popover.
 */
export function EmojiPicker({ open, onOpenChange, onPick }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(
    EMOJI_CATEGORIES[0]!.id,
  )
  const current =
    EMOJI_CATEGORIES.find((c) => c.id === activeCategory) ??
    EMOJI_CATEGORIES[0]!

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Inserir emoji"
            >
              <IconMoodSmile className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Emoji (:)</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[320px] p-0"
      >
        <div
          className="border-border/40 flex items-center gap-1 border-b px-2 py-1.5"
          role="tablist"
          aria-label="Categorias de emoji"
        >
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={cat.id === activeCategory}
              onClick={() => setActiveCategory(cat.id)}
              className={`hover:bg-muted focus-visible:ring-ring rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                cat.id === activeCategory
                  ? "bg-muted text-foreground"
                  : "text-foreground/60"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div
          className="grid max-h-[240px] grid-cols-8 gap-1 overflow-y-auto p-2"
          role="grid"
          aria-label={`Emojis: ${current.label}`}
        >
          {current.emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji)
              }}
              className="hover:bg-muted focus-visible:ring-ring flex size-8 items-center justify-center rounded-md text-xl leading-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`Inserir ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
