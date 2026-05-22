import { IconPlus, IconX } from "@tabler/icons-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface EditableListProps {
  items: string[]
  placeholder?: string
  onChange: (items: string[]) => void
}

export function EditableList({
  items,
  placeholder,
  onChange,
}: EditableListProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")

  function commitDraft() {
    const trimmed = draft.trim()
    if (trimmed === "") return
    onChange([...items, trimmed])
    setDraft("")
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function updateAt(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)))
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={index}
            className="border-border/50 bg-muted/10 flex items-start gap-2 rounded-lg border px-3 py-2"
          >
            <span className="text-muted-foreground mt-2 text-xs">•</span>
            <Input
              value={item}
              onChange={(event) => updateAt(index, event.target.value)}
              className="border-transparent bg-transparent shadow-none focus-visible:ring-1"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => removeAt(index)}
              title={t("pages.agent.templates.remove_item")}
            >
              <IconX className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          placeholder={placeholder ?? t("pages.agent.templates.add_item")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commitDraft()
            }
          }}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={commitDraft}
          disabled={draft.trim() === ""}
        >
          <IconPlus className="size-3.5" />
          {t("pages.agent.templates.add_item")}
        </Button>
      </div>
    </div>
  )
}
