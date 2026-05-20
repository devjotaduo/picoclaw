import { IconLink, IconPlus, IconX } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import {
  groupJIDToHandle,
  handleToGroupJID,
  shortGroupLabel,
} from "./whatsapp-format"

export interface WhatsAppGroupListProps {
  id?: string
  jids: string[]
  onChange: (jids: string[]) => void
  emptyHint?: string
  ariaLabel?: string
}

export function WhatsAppGroupList({
  id,
  jids,
  onChange,
  emptyHint = "Nenhum grupo vinculado.",
  ariaLabel = "Lista de grupos autorizados",
}: WhatsAppGroupListProps) {
  const [draft, setDraft] = useState("")
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function add() {
    const handle = groupJIDToHandle(draft)
    if (!handle) return
    if (!/^\d{10,}$/.test(handle)) {
      setError("ID de grupo inválido — cole o convite ou o ID numérico.")
      return
    }
    const jid = handleToGroupJID(handle)
    if (jids.includes(jid)) {
      setError("Esse grupo já está na lista.")
      return
    }
    onChange([...jids, jid])
    setDraft("")
    setError(null)
  }

  function remove(jid: string) {
    onChange(jids.filter((x) => x !== jid))
    const next = { ...labels }
    delete next[jid]
    setLabels(next)
  }

  function rename(jid: string, label: string) {
    setLabels({ ...labels, [jid]: label })
  }

  return (
    <div className="space-y-2">
      <ul aria-label={ariaLabel} className="space-y-1.5">
        {jids.length === 0 && (
          <li className="text-muted-foreground text-xs">{emptyHint}</li>
        )}
        {jids.map((jid) => (
          <li
            key={jid}
            className="border-border/60 bg-muted/40 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
          >
            <IconLink
              className="text-muted-foreground size-3.5 shrink-0"
              aria-hidden="true"
            />
            <Input
              value={labels[jid] ?? ""}
              onChange={(e) => rename(jid, e.target.value)}
              placeholder={shortGroupLabel(jid)}
              aria-label={`Apelido do grupo ${shortGroupLabel(jid)}`}
              className="focus-visible:bg-background h-7 flex-1 border-transparent bg-transparent px-1.5 text-xs shadow-none"
            />
            <button
              type="button"
              onClick={() => remove(jid)}
              aria-label={`Remover ${labels[jid] || shortGroupLabel(jid)}`}
              className="text-muted-foreground hover:text-destructive focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-5 w-5 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <IconX className="size-3.5" aria-hidden="true" />
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
              add()
            }
          }}
          placeholder="Cole o convite ou o ID do grupo"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? `${id ?? "group"}-err` : undefined}
          className={cn("text-sm", error && "border-destructive")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          aria-label="Vincular grupo"
          className="gap-1"
        >
          <IconPlus className="size-4" aria-hidden="true" />
          Vincular grupo
        </Button>
      </div>
      {error && (
        <p
          id={`${id ?? "group"}-err`}
          role="alert"
          className="text-destructive text-xs"
        >
          {error}
        </p>
      )}
    </div>
  )
}
