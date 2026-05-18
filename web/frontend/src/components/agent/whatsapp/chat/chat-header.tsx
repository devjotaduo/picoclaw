import {
  IconArrowLeft,
  IconCamera,
  IconLoader2,
  IconSearch,
  IconUserEdit,
} from "@tabler/icons-react"

import type { InboxConnectionStatus, WhatsAppChat } from "@/api/whatsapp"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { AgentStatusChip } from "./agent-status-chip"
import { ConnectionStatus } from "./connection-status"
import { ContactAvatar } from "./contact-avatar"
import { TypingIndicator } from "./typing-indicator"

function formatJID(jid: string): string {
  const [user] = jid.split("@")
  if (!user) return jid
  return /^\d+$/.test(user) ? `+${user}` : user
}

export interface ChatHeaderProps {
  chat: WhatsAppChat
  displayName: string
  avatarUrl?: string
  avatarLoading?: boolean
  autoPaused?: boolean
  connectionStatus: InboxConnectionStatus
  togglingPause: boolean
  /** Whether the contact is typing right now (from gateway typing event). */
  isTyping?: boolean
  onTogglePause: (paused: boolean) => void
  onResume?: () => void
  onBack: () => void
  onOpenProfile: () => void
  onRefreshAvatar: () => void
  /** Toggles the in-conversation search bar. */
  onToggleSearch?: () => void
  searchOpen?: boolean
}

export function ChatHeader({
  chat,
  displayName,
  avatarUrl,
  avatarLoading,
  autoPaused,
  connectionStatus,
  togglingPause,
  isTyping = false,
  onTogglePause,
  onResume,
  onBack,
  onOpenProfile,
  onRefreshAvatar,
  onToggleSearch,
  searchOpen = false,
}: ChatHeaderProps) {
  return (
    <header className="border-border/40 bg-background flex items-center gap-3 border-b px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors lg:hidden"
        aria-label="Voltar para a lista de conversas"
      >
        <IconArrowLeft className="size-5" aria-hidden="true" />
      </button>

      <div className="group relative shrink-0">
        <ContactAvatar name={displayName} url={avatarUrl} size="sm" />
        <button
          type="button"
          onClick={onRefreshAvatar}
          disabled={avatarLoading}
          className="focus-visible:ring-ring absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:bg-black/40 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
          aria-label="Atualizar foto de perfil"
        >
          {avatarLoading ? (
            <IconLoader2 className="size-4 animate-spin text-white" />
          ) : (
            <IconCamera className="size-4 text-white" />
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenProfile}
        className="group min-w-0 flex-1 text-left"
        aria-label={`Abrir perfil de ${displayName}`}
      >
        <h3 className="group-hover:text-primary truncate text-base font-semibold leading-tight transition-colors">
          {displayName}
        </h3>
        <p className="text-foreground/65 mt-0.5 truncate text-[13px]">
          {isTyping ? (
            <TypingIndicator name={displayName.split(" ")[0]} />
          ) : (
            formatJID(chat.jid)
          )}
        </p>
      </button>

      <div className="hidden lg:flex">
        <ConnectionStatus status={connectionStatus} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onToggleSearch && (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleSearch}
                className={`text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                  searchOpen ? "bg-muted text-foreground" : ""
                }`}
                aria-label="Buscar na conversa"
                aria-pressed={searchOpen}
              >
                <IconSearch className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Buscar (Ctrl+F)</TooltipContent>
          </Tooltip>
        )}

        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenProfile}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Editar perfil do contato"
            >
              <IconUserEdit className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Editar perfil</TooltipContent>
        </Tooltip>

        <div className="border-border/40 ml-1 flex items-center gap-2 border-l pl-2">
          <AgentStatusChip
            paused={chat.paused}
            autoPaused={autoPaused}
            onResume={onResume}
            className="hidden sm:inline-flex"
          />
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <span>
                <Switch
                  checked={!chat.paused}
                  disabled={togglingPause}
                  onCheckedChange={(active) => onTogglePause(!active)}
                  aria-label={
                    chat.paused
                      ? "Ativar respostas automáticas do agente"
                      : "Pausar respostas automáticas do agente"
                  }
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {chat.paused ? "Agente pausado" : "Agente ativo"}
            </TooltipContent>
          </Tooltip>
          {togglingPause && (
            <IconLoader2
              className="text-muted-foreground size-3.5 animate-spin"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </header>
  )
}
