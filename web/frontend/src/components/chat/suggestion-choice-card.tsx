import { IconArrowUp, IconX } from "@tabler/icons-react"
import { type KeyboardEvent, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { Button } from "@/components/ui/button"
import type {
  ChatSuggestionCardData,
  ChatSuggestionChoice,
} from "@/lib/chat-suggestion-card"
import { cn } from "@/lib/utils"

interface SuggestionChoiceCardProps {
  card: ChatSuggestionCardData
  disabled?: boolean
  onSubmit?: (value: string) => void
}

function serializeChoice(choice: ChatSuggestionChoice): string {
  return choice.description
    ? `${choice.title}: ${choice.description}`
    : choice.title
}

export function SuggestionChoiceCard({
  card,
  disabled = false,
  onSubmit,
}: SuggestionChoiceCardProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const customInputRef = useRef<HTMLInputElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [customValue, setCustomValue] = useState("")
  const [dismissed, setDismissed] = useState(false)
  const trimmedCustomValue = customValue.trim()
  const selectedChoice = card.options[selectedIndex]
  const hasEnoughChoices = card.options.length > 1
  const canSend =
    hasEnoughChoices &&
    Boolean(trimmedCustomValue || selectedChoice) &&
    !disabled

  const submit = () => {
    if (!canSend) {
      return
    }

    onSubmit?.(
      trimmedCustomValue ||
        (selectedChoice ? serializeChoice(selectedChoice) : ""),
    )
    setDismissed(true)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || disabled) {
      return
    }

    const target = event.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      submit()
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setDismissed(true)
      return
    }

    const optionNumber = Number(event.key)
    if (
      Number.isInteger(optionNumber) &&
      optionNumber >= 1 &&
      optionNumber <= card.options.length
    ) {
      event.preventDefault()
      setCustomValue("")
      setSelectedIndex(optionNumber - 1)
      return
    }

    if (event.key === "5") {
      event.preventDefault()
      customInputRef.current?.focus()
    }
  }

  if (dismissed) {
    return null
  }

  return (
    <div
      className="bg-card/95 p-4 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-yellow-300" />
          <h3 className="text-foreground truncate text-base font-semibold">
            {card.title}
          </h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("chat.suggestionChoice.dismiss")}
          onClick={() => setDismissed(true)}
        >
          <IconX className="size-4" />
        </Button>
      </div>

      <Suggestions>
        {card.options.map((option, index) => {
          const selected = index === selectedIndex && !trimmedCustomValue
          return (
            <Suggestion
              key={`${option.title}-${index}`}
              suggestion={serializeChoice(option)}
              className={cn(
                "group/choice flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                "justify-start whitespace-normal",
                selected
                  ? "border-amber-300/55 bg-[#3a3324] shadow-[inset_3px_0_0_rgba(245,188,65,0.85)]"
                  : "border-[#3b3b3b] bg-[#2d2d2d] hover:border-amber-300/35 hover:bg-[#36332d]",
              )}
              onClick={() => {
                setCustomValue("")
                setSelectedIndex(index)
              }}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    selected ? "text-amber-50" : "text-foreground",
                  )}
                >
                  {option.title}
                </span>
                {option.description ? (
                  <span
                    className={cn(
                      "mt-0.5 block text-[13px] leading-snug",
                      selected ? "text-amber-100/70" : "text-muted-foreground",
                    )}
                  >
                    {option.description}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                  selected
                    ? "border-transparent bg-amber-300 text-zinc-950"
                    : "border-[#4a4a4a] bg-[#383838] text-zinc-300 group-hover/choice:border-amber-300/40 group-hover/choice:text-amber-100",
                )}
              >
                {index + 1}
              </span>
            </Suggestion>
          )
        })}

        {!hasEnoughChoices ? (
          <div className="text-muted-foreground rounded-lg border border-[#3b3b3b] bg-[#2d2d2d] px-3 py-2.5 text-sm">
            Aguardando outras opções...
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-lg border border-[#3b3b3b] bg-[#2d2d2d] px-3 py-2.5",
            !hasEnoughChoices && "opacity-55",
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor={inputId}
              className="text-foreground text-sm font-semibold"
            >
              {t("chat.suggestionChoice.other")}
            </label>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[#4a4a4a] bg-[#383838] text-xs font-semibold text-zinc-300">
              5
            </span>
          </div>
          <input
            ref={customInputRef}
            id={inputId}
            value={customValue}
            className="text-foreground h-9 w-full rounded-md border border-[#474747] bg-[#3a3a3a] px-3 text-sm outline-none placeholder:text-zinc-500 focus:border-amber-300/55 focus:ring-3 focus:ring-amber-300/15"
            placeholder={t("chat.suggestionChoice.placeholder")}
            disabled={!hasEnoughChoices}
            onChange={(event) => setCustomValue(event.target.value)}
            onFocus={() => setSelectedIndex(-1)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submit()
              }
            }}
          />
        </div>
      </Suggestions>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
        >
          {t("chat.suggestionChoice.skip")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="disabled:bg-muted disabled:text-muted-foreground bg-zinc-200 text-zinc-950 hover:bg-zinc-100"
          disabled={!canSend}
          onClick={submit}
        >
          {t("chat.suggestionChoice.send")}
          <IconArrowUp className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
