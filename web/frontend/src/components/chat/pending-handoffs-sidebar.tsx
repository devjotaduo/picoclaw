import { IconHeadset, IconInbox } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { type WhatsAppChat, listWhatsAppChats } from "@/api/whatsapp"
import { cn } from "@/lib/utils"
import { formatJID, formatRelativeTS } from "@/lib/whatsapp/format"
import { truncatePreview } from "@/lib/whatsapp/quote"

const QUERY_KEY = ["whatsapp", "chats", "pending-handoffs"] as const

function getChatDisplayName(chat: WhatsAppChat): string {
  return (
    chat.display_name?.trim() || chat.push_name?.trim() || formatJID(chat.jid)
  )
}

export function PendingHandoffsSidebar({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listWhatsAppChats(150),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const pending = useMemo(() => {
    return (data ?? [])
      .filter((c) => c.paused)
      .sort((a, b) => b.last_message_ts - a.last_message_ts)
  }, [data])

  return (
    <aside
      className={cn(
        "border-border/40 bg-background/60 flex h-full w-72 shrink-0 flex-col border-l",
        className,
      )}
      aria-label={t("chat.pendingHandoffs.title")}
    >
      <div className="border-border/40 flex items-center gap-2 border-b px-4 py-3">
        <IconHeadset className="text-primary size-4" />
        <h2 className="text-foreground/90 text-sm font-medium">
          {t("chat.pendingHandoffs.title")}
        </h2>
        {pending.length > 0 && (
          <span className="bg-primary/10 text-primary ml-auto rounded-full px-2 py-0.5 text-xs font-medium">
            {pending.length}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <div className="text-muted-foreground px-4 py-6 text-xs">
            {t("chat.pendingHandoffs.loading")}
          </div>
        )}

        {!isLoading && pending.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-center justify-center px-4 py-10 text-center text-xs">
            <IconInbox className="mb-2 size-6 opacity-50" />
            <p>{t("chat.pendingHandoffs.empty")}</p>
          </div>
        )}

        <ul className="flex flex-col">
          {pending.map((chat) => {
            const name = getChatDisplayName(chat)
            const preview = chat.last_preview
              ? truncatePreview(chat.last_preview)
              : ""
            return (
              <li key={chat.jid}>
                <Link
                  to="/agent/whatsapp"
                  search={{ jid: chat.jid }}
                  className="hover:bg-muted/60 focus-visible:bg-muted/60 border-border/30 flex flex-col gap-1 border-b px-4 py-3 transition-colors focus:outline-hidden"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground truncate text-sm font-medium">
                      {name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-[10px] tracking-wide uppercase">
                      {formatRelativeTS(chat.last_message_ts)}
                    </span>
                  </div>
                  {preview && (
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {preview}
                    </p>
                  )}
                  {chat.unread_count > 0 && (
                    <span className="mt-1 w-fit rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                      {t("chat.pendingHandoffs.unread", {
                        count: chat.unread_count,
                      })}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
