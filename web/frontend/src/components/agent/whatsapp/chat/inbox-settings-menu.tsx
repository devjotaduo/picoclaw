import {
  IconLinkOff,
  IconLoader2,
  IconPlayerPause,
  IconPlayerStop,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react"
import { useState } from "react"

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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useGateway } from "@/hooks/use-gateway"

export interface InboxSettingsMenuProps {
  onRefresh?: () => void
  isRefreshing?: boolean
  canRefresh?: boolean
  channelEnabled?: boolean
  onPauseChannel?: () => void
  onDisconnectChannel?: () => void
  channelActionPending?: boolean
  isPausingChannel?: boolean
  isDisconnectingChannel?: boolean
}

/**
 * Page-level settings menu for the WhatsApp inbox. Holds destructive actions
 * (gateway stop) behind a confirmation modal so they can't be triggered
 * accidentally while the operator is clicking around the conversation list.
 */
export function InboxSettingsMenu({
  onRefresh,
  isRefreshing,
  canRefresh = true,
  channelEnabled = false,
  onPauseChannel,
  onDisconnectChannel,
  channelActionPending = false,
  isPausingChannel = false,
  isDisconnectingChannel = false,
}: InboxSettingsMenuProps) {
  const { stop, loading: gatewayLoading, state: gatewayState } = useGateway()
  const [stopOpen, setStopOpen] = useState(false)
  const gatewayRunning = gatewayState === "running"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Configurações da caixa"
          >
            <IconSettings className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Caixa de entrada</DropdownMenuLabel>
          {onRefresh && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                if (!canRefresh) return
                onRefresh()
              }}
              disabled={isRefreshing || !canRefresh}
            >
              {isRefreshing ? (
                <IconLoader2 className="mr-2 size-3.5 animate-spin" />
              ) : (
                <IconRefresh className="mr-2 size-3.5" />
              )}
              Atualizar conversas
            </DropdownMenuItem>
          )}
          {channelEnabled && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Canal WhatsApp</DropdownMenuLabel>
              {onPauseChannel && (
                <DropdownMenuItem
                  disabled={channelActionPending}
                  onSelect={(e) => {
                    e.preventDefault()
                    onPauseChannel()
                  }}
                >
                  {isPausingChannel ? (
                    <IconLoader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <IconPlayerPause className="mr-2 size-3.5" />
                  )}
                  Pausar canal
                </DropdownMenuItem>
              )}
              {onDisconnectChannel && (
                <DropdownMenuItem
                  disabled={channelActionPending}
                  onSelect={(e) => {
                    e.preventDefault()
                    onDisconnectChannel()
                  }}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  {isDisconnectingChannel ? (
                    <IconLoader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <IconLinkOff className="mr-2 size-3.5" />
                  )}
                  Desconectar número
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-destructive">
            Ações destrutivas
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!gatewayRunning || gatewayLoading}
            onSelect={(e) => {
              e.preventDefault()
              setStopOpen(true)
            }}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <IconPlayerStop className="mr-2 size-3.5" />
            Parar gateway WhatsApp
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={stopOpen} onOpenChange={setStopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parar gateway WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              O gateway para de receber e enviar mensagens imediatamente. As
              conversas existentes continuam salvas, mas o agente automático
              fica indisponível até o gateway ser reiniciado. Tem certeza?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setStopOpen(false)
                void stop()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Parar gateway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
