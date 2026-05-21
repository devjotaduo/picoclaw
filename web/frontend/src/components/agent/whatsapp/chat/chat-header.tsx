import {
  IconArrowLeft,
  IconCamera,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconSearch,
  IconUserEdit,
} from "@tabler/icons-react"

import type { WhatsAppChat } from "@/api/whatsapp"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { ContactAvatar } from "./contact-avatar"
import { TypingIndicator } from "./typing-indicator"

export interface ChatHeaderProps {
  chat: WhatsAppChat
  displayName: string
  avatarUrl?: string
  avatarLoading?: boolean
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
  const pauseButtonLabel = chat.paused ? "Retomar agente" : "Pausar agente"

  return (
    <header className="border-border/40 bg-background flex items-center gap-3 border-b px-3 py-2.5">
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
          className="focus-visible:ring-ring absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 focus-visible:bg-black/40 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
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
        <h3 className="group-hover:text-primary truncate text-sm leading-tight font-semibold transition-colors sm:text-base">
          {displayName}
        </h3>
        {isTyping && (
          <p className="text-foreground/65 mt-0.5 truncate text-[12px]">
            <TypingIndicator name={displayName.split(" ")[0]} />
          </p>
        )}
      </button>

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

        <Tooltip delayDuration={700}>
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

        <button
          type="button"
          onClick={() => {
            if (chat.paused) {
              if (onResume) onResume()
              else onTogglePause(false)
              return
            }
            onTogglePause(true)
          }}
          disabled={togglingPause}
          className={`focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
            chat.paused
              ? "bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          aria-label={pauseButtonLabel}
        >
          {togglingPause ? (
            <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : chat.paused ? (
            <IconPlayerPlay className="size-3.5" aria-hidden="true" />
          ) : (
            <IconPlayerPause className="size-3.5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {chat.paused ? "Retomar" : "Pausar"}
          </span>
        </button>
      </div>
    </header>
  )
}
