import { IconBolt, IconBrandWhatsapp } from "@tabler/icons-react"
import { useMemo } from "react"

import type { WhatsAppChat } from "@/api/whatsapp"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Dialog, DialogContent } from "@/components/ui/dialog"

export interface CommandPaletteAction {
  id: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chats: readonly WhatsAppChat[]
  /** Selecting a chat opens it in the conversation panel. */
  onOpenChat: (chat: WhatsAppChat) => void
  /** Page-level actions (open search, refresh, mark all read, …). */
  actions?: readonly CommandPaletteAction[]
}

function jidLabel(chat: WhatsAppChat): string {
  const [user] = chat.jid.split("@")
  if (!user) return chat.jid
  return /^\d+$/.test(user) ? `+${user}` : user
}

/**
 * Ctrl/⌘+K palette. Lists every chat (filterable by name/phone) plus a set
 * of inbox-level actions. Mirrors the Linear/Slack pattern of "everything
 * reachable from the keyboard".
 */
export function CommandPalette({
  open,
  onOpenChange,
  chats,
  onOpenChat,
  actions = [],
}: CommandPaletteProps) {
  const items = useMemo(
    () =>
      chats.map((c) => ({
        chat: c,
        label: c.display_name || c.push_name || jidLabel(c),
        sub: jidLabel(c),
      })),
    [chats],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <Command>
          <CommandInput placeholder="Buscar conversa, ação ou template…" />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>Nada encontrado.</CommandEmpty>

            {actions.length > 0 && (
              <>
                <CommandGroup heading="Ações da caixa">
                  {actions.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={`action ${a.label}`}
                      onSelect={() => {
                        a.onSelect()
                        onOpenChange(false)
                      }}
                    >
                      {a.icon ?? (
                        <IconBolt className="mr-2 size-4" aria-hidden="true" />
                      )}
                      {a.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup heading="Conversas">
              {items.map(({ chat, label, sub }) => (
                <CommandItem
                  key={chat.jid}
                  value={`${label} ${sub}`}
                  onSelect={() => {
                    onOpenChat(chat)
                    onOpenChange(false)
                  }}
                >
                  <IconBrandWhatsapp
                    className="mr-2 size-4 text-[#25d366]"
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{label}</span>
                  <span className="text-foreground/70 ml-3 text-[11px] tabular-nums">
                    {sub}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
