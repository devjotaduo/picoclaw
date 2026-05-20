import { IconPlus, IconX } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface TagInputProps {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  emptyHint?: string
  ariaLabel?: string
  suggestions?: string[]
  maxTags?: number
}

export function TagInput({
  id,
  value,
  onChange,
  placeholder = "Digite e pressione Enter",
  emptyHint = "Nenhum item adicionado.",
  ariaLabel = "Lista de tags",
  suggestions,
  maxTags,
}: TagInputProps) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  function add(raw: string) {
    const tag = raw.trim()
    if (!tag) return
    if (value.includes(tag)) {
      setError("Esse item já está na lista.")
      return
    }
    if (maxTags && value.length >= maxTags) {
      setError(`Limite de ${maxTags} itens atingido.`)
      return
    }
    onChange([...value, tag])
    setDraft("")
    setError(null)
  }

  function remove(tag: string) {
    onChange(value.filter((x) => x !== tag))
  }

  const availableSuggestions = suggestions?.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase()),
  )

  return (
    <div className="space-y-2">
      <ul aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
        {value.length === 0 && (
          <li className="text-muted-foreground text-xs">{emptyHint}</li>
        )}
        {value.map((tag) => (
          <li
            key={tag}
            className="border-border/60 bg-muted/40 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
          >
            <span className="font-medium">{tag}</span>
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remover ${tag}`}
              className="text-muted-foreground hover:text-destructive focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-4 w-4 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <IconX className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add(draft)
            } else if (e.key === "," || e.key === ";") {
              e.preventDefault()
              add(draft)
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              remove(value[value.length - 1]!)
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          list={suggestions ? `${id ?? "tag"}-suggestions` : undefined}
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? `${id ?? "tag"}-err` : undefined}
          className={cn("text-sm", error && "border-destructive")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add(draft)}
          aria-label="Adicionar item"
          className="gap-1"
        >
          <IconPlus className="size-4" aria-hidden="true" />
          Adicionar
        </Button>
      </div>
      {suggestions &&
        availableSuggestions &&
        availableSuggestions.length > 0 && (
          <datalist id={`${id ?? "tag"}-suggestions`}>
            {availableSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      {error && (
        <p
          id={`${id ?? "tag"}-err`}
          role="alert"
          className="text-destructive text-xs"
        >
          {error}
        </p>
      )}
    </div>
  )
}
