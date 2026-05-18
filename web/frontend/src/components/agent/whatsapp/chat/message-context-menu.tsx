import {
  IconCopy,
  IconCornerDownLeft,
  IconInfoCircle,
  IconShare,
  IconTrash,
} from "@tabler/icons-react"
import { useState } from "react"
import { toast } from "sonner"

import type {
  WhatsAppMessage,
  WhatsAppMessageStatus,
} from "@/api/whatsapp"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export interface MessageContextMenuProps {
  message: WhatsAppMessage
  status: WhatsAppMessageStatus | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Anchor element the menu attaches to. */
  trigger: React.ReactNode
  onReply: () => void
  onForward?: (message: WhatsAppMessage) => void
  /** Removes the bubble from THIS dashboard only — does not delete on WhatsApp. */
  onDeleteLocal?: (message: WhatsAppMessage) => void
}

function formatFullTimestamp(ts: number): string {
  if (!ts) return "—"
  const d = new Date(ts < 1e10 ? ts * 1000 : ts)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

const STATUS_LABEL: Record<WhatsAppMessageStatus, string> = {
  pending: "Enviando",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
}

export function MessageContextMenu({
  message,
  status,
  open,
  onOpenChange,
  trigger,
  onReply,
  onForward,
  onDeleteLocal,
}: MessageContextMenuProps) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        {trigger}
        <DropdownMenuContent
          align={message.direction === "out" ? "end" : "start"}
          className="w-52"
        >
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard
                .writeText(message.content)
                .then(() => toast.success("Texto copiado"))
                .catch(() => toast.error("Não foi possível copiar"))
            }}
          >
            <IconCopy className="mr-2 size-3.5" aria-hidden="true" />
            Copiar texto
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onReply}>
            <IconCornerDownLeft className="mr-2 size-3.5" aria-hidden="true" />
            Responder
          </DropdownMenuItem>
          {onForward && (
            <DropdownMenuItem onSelect={() => onForward(message)}>
              <IconShare className="mr-2 size-3.5" aria-hidden="true" />
              Encaminhar
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setInfoOpen(true)}>
            <IconInfoCircle className="mr-2 size-3.5" aria-hidden="true" />
            Informações
          </DropdownMenuItem>
          {onDeleteLocal && (
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <IconTrash className="mr-2 size-3.5" aria-hidden="true" />
              Deletar para mim
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Informações da mensagem</DialogTitle>
            <DialogDescription>
              Detalhes de envio e entrega registrados pelo gateway.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-xs">
            <dt className="text-foreground/60">Direção</dt>
            <dd className="font-medium">
              {message.direction === "out" ? "Enviada" : "Recebida"}
            </dd>
            <dt className="text-foreground/60">Origem</dt>
            <dd className="font-medium">
              {message.source === "human"
                ? "Operador (manual)"
                : message.source === "agent"
                  ? "Agente automático"
                  : "Contato"}
            </dd>
            <dt className="text-foreground/60">Status</dt>
            <dd className="font-medium">
              {status ? STATUS_LABEL[status] : "—"}
              {message.error ? ` · falha: ${message.error}` : ""}
            </dd>
            <dt className="text-foreground/60">Enviada em</dt>
            <dd className="font-medium">{formatFullTimestamp(message.ts)}</dd>
            {message.read_at != null && message.read_at > 0 && (
              <>
                <dt className="text-foreground/60">Lida em</dt>
                <dd className="font-medium">
                  {formatFullTimestamp(message.read_at)}
                </dd>
              </>
            )}
            <dt className="text-foreground/60">ID interno</dt>
            <dd className="font-mono text-[11px]">{message.id}</dd>
            {message.message_id && (
              <>
                <dt className="text-foreground/60">WhatsApp ID</dt>
                <dd className="font-mono break-all text-[11px]">
                  {message.message_id}
                </dd>
              </>
            )}
          </dl>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover do dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem some apenas desta caixa de entrada — o contato continua
              vendo a mensagem original no WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteOpen(false)
                onDeleteLocal?.(message)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
