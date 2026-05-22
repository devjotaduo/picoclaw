import { IconPlus, IconX } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import {
  formatPhoneBR,
  isValidPhone,
  jidToPhone,
  phoneToJID,
} from "./whatsapp-format"

export interface WhatsAppPhoneListProps {
  id?: string
  jids: string[]
  onChange: (jids: string[]) => void
  placeholder?: string
  emptyHint?: string
  ariaLabel?: string
}

export function WhatsAppPhoneList({
  id,
  jids,
  onChange,
  placeholder = "+55 (11) 99999-9999",
  emptyHint = "Nenhum número autorizado. Adicione abaixo.",
  ariaLabel = "Lista de números autorizados",
}: WhatsAppPhoneListProps) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  function add() {
    const phone = draft.trim()
    if (!phone) return
    if (!isValidPhone(phone)) {
      setError("Número inválido — informe DDI + DDD + número.")
      return
    }
    const jid = phoneToJID(phone)
    if (jids.includes(jid)) {
      setError("Esse número já está na lista.")
      return
    }
    onChange([...jids, jid])
    setDraft("")
    setError(null)
  }

  function remove(jid: string) {
    onChange(jids.filter((x) => x !== jid))
  }

  return (
    <div className="space-y-2">
      <ul aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
        {jids.length === 0 && (
          <li className="text-muted-foreground text-xs">{emptyHint}</li>
        )}
        {jids.map((jid) => {
          const phone = jidToPhone(jid)
          const display = formatPhoneBR(phone) || phone
          return (
            <li
              key={jid}
              className="border-border/60 bg-muted/40 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            >
              <span className="font-medium">{display}</span>
              <button
                type="button"
                onClick={() => remove(jid)}
                aria-label={`Remover ${display}`}
                className="text-muted-foreground hover:text-destructive focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-4 w-4 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              >
                <IconX className="size-3" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(formatPhoneBR(e.target.value))
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          inputMode="tel"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? `${id ?? "phone"}-err` : undefined}
          className={cn("text-sm", error && "border-destructive")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          aria-label="Adicionar número"
          className="gap-1"
        >
          <IconPlus className="size-4" aria-hidden="true" />
          Adicionar
        </Button>
      </div>
      {error && (
        <p
          id={`${id ?? "phone"}-err`}
          role="alert"
          className="text-destructive text-xs"
        >
          {error}
        </p>
      )}
    </div>
  )
}
