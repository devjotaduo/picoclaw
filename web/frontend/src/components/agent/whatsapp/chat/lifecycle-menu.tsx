import {
  IconArchive,
  IconCheck,
  IconChevronDown,
  IconRefresh,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react"
import { useState } from "react"

import type { WhatsAppContactProfile } from "@/api/whatsapp"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

export type LifecycleAction = "resolve" | "archive" | "reopen"

export interface LifecycleMenuProps {
  profile: WhatsAppContactProfile | null
  /** Apply the lifecycle change (updates the profile via saveProfile). */
  onAction: (action: LifecycleAction) => void
  /** Apply a new assignee (also saves the profile). */
  onAssignTo: (operator: string) => void
  /** Known operator handles for suggestions. */
  operatorSuggestions?: readonly string[]
}

export function LifecycleMenu({
  profile,
  onAction,
  onAssignTo,
  operatorSuggestions = [],
}: LifecycleMenuProps) {
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTo, setAssignTo] = useState("")
  const isClosed = profile?.lead_stage === "closed" || profile?.lead_stage === "lost"
  const isArchived = (profile?.tags ?? []).some(
    (t) => t.trim().toLowerCase() === "archived",
  )
  const assignedTo = profile?.assigned_to?.trim()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-foreground/65 h-7 gap-1 rounded-full px-2.5 text-[11px]"
            aria-label="Ações da conversa"
          >
            <IconUsers className="size-3" aria-hidden="true" />
            {assignedTo ? assignedTo : "Atribuir"}
            <IconChevronDown className="size-3 opacity-60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Atribuição</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setAssignTo(assignedTo ?? "")
              setAssignOpen(true)
            }}
          >
            <IconUserPlus className="mr-2 size-3.5" aria-hidden="true" />
            {assignedTo ? "Reatribuir" : "Atribuir a…"}
          </DropdownMenuItem>
          {assignedTo && (
            <DropdownMenuItem onSelect={() => onAssignTo("")}>
              Remover atribuição
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Ciclo de vida</DropdownMenuLabel>
          {!isClosed && (
            <DropdownMenuItem onSelect={() => onAction("resolve")}>
              <IconCheck className="mr-2 size-3.5" aria-hidden="true" />
              Resolver
            </DropdownMenuItem>
          )}
          {!isArchived && (
            <DropdownMenuItem onSelect={() => onAction("archive")}>
              <IconArchive className="mr-2 size-3.5" aria-hidden="true" />
              Arquivar
            </DropdownMenuItem>
          )}
          {(isClosed || isArchived) && (
            <DropdownMenuItem onSelect={() => onAction("reopen")}>
              <IconRefresh className="mr-2 size-3.5" aria-hidden="true" />
              Reabrir
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Atribuir conversa</DialogTitle>
            <DialogDescription>
              O nome do atendente é salvo no perfil do contato. Use o mesmo
              identificador (e-mail ou apelido) que aparece nos relatórios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              placeholder="Ex: ana@jotaduo.com"
              autoFocus
              list="operator-suggestions"
              aria-label="Atendente"
            />
            <datalist id="operator-suggestions">
              {operatorSuggestions.map((op) => (
                <option key={op} value={op} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onAssignTo(assignTo.trim())
                setAssignOpen(false)
              }}
              disabled={assignTo.trim().length === 0}
            >
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
