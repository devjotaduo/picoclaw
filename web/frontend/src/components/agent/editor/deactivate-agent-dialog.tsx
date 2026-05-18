import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface ActiveConversation {
  id: string
  contactLabel: string
  channel?: string
}

export interface DeactivateAgentDialogProps {
  open: boolean
  agentName: string
  conversations: ActiveConversation[]
  isLoadingConversations?: boolean
  isSubmitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeactivateAgentDialog({
  open,
  agentName,
  conversations,
  isLoadingConversations,
  isSubmitting,
  onConfirm,
  onCancel,
}: DeactivateAgentDialogProps) {
  const count = conversations.length
  const headline =
    count === 0
      ? `Desativar ${agentName}?`
      : `Desativar ${agentName} interromperá ${count} ${count === 1 ? "conversa" : "conversas"}`

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="bg-amber-100 dark:bg-amber-950/40 mb-2 flex size-9 items-center justify-center rounded-full">
            <IconAlertTriangle
              className="size-5 text-amber-700 dark:text-amber-300"
              aria-hidden="true"
            />
          </div>
          <DialogTitle>{headline}</DialogTitle>
          <DialogDescription>
            O atendimento automático vai parar para os contatos abaixo até você
            reativar o agente. As mensagens recebidas ficam pendentes para
            resposta manual.
          </DialogDescription>
        </DialogHeader>

        <div className="border-border/60 bg-muted/30 max-h-48 overflow-y-auto rounded-lg border">
          {isLoadingConversations ? (
            <div className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
              <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Carregando conversas ativas…
            </div>
          ) : count === 0 ? (
            <p className="text-muted-foreground p-3 text-xs">
              Nenhuma conversa ativa no momento. Ainda assim, novos contatos
              não serão atendidos automaticamente.
            </p>
          ) : (
            <ul role="list" className="divide-border/40 divide-y">
              {conversations.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <span className="truncate font-medium">{c.contactLabel}</span>
                  {c.channel && (
                    <span className="text-muted-foreground shrink-0 text-[10px] uppercase">
                      {c.channel}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500"
          >
            {isSubmitting && (
              <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            Desativar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
