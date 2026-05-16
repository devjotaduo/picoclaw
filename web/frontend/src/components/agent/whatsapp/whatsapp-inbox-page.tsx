import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type InboxEvent,
  type WhatsAppChat,
  type WhatsAppContactProfile,
  type WhatsAppConversationInsight,
  type WhatsAppMessage,
  getWhatsAppContactProfile,
  getWhatsAppConversationInsight,
  listWhatsAppChats,
  listWhatsAppMessages,
  markWhatsAppChatRead,
  openInboxStream,
  pauseWhatsAppChat,
  sendWhatsAppManual,
} from "@/api/whatsapp"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const CHATS_QUERY_KEY = ["whatsapp", "chats"]
const messagesQueryKey = (jid: string) => ["whatsapp", "messages", jid]

export function WhatsAppInboxPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedJID, setSelectedJID] = useState<string | null>(null)
  const [draft, setDraft] = useState("")

  const chatsQuery = useQuery({
    queryKey: CHATS_QUERY_KEY,
    queryFn: () => listWhatsAppChats(150),
    refetchInterval: 30_000,
  })

  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(selectedJID ?? ""),
    queryFn: () => listWhatsAppMessages(selectedJID ?? "", 200),
    enabled: !!selectedJID,
  })

  // Live updates via SSE — bypasses React Query polling so messages appear
  // the moment whatsmeow receives them.
  useEffect(() => {
    const close = openInboxStream((evt: InboxEvent) => {
      if (evt.kind === "message" && evt.message) {
        const jid = evt.message.chat_jid
        queryClient.setQueryData<WhatsAppMessage[]>(
          messagesQueryKey(jid),
          (prev) => {
            if (!prev) return prev
            if (prev.some((m) => m.id === evt.message!.id)) return prev
            return [evt.message!, ...prev]
          },
        )
      }
      if (evt.chat) {
        // Merge the updated chat row into the cached list while preserving
        // ordering (the backend already orders by last_message_ts DESC).
        queryClient.setQueryData<WhatsAppChat[]>(CHATS_QUERY_KEY, (prev) => {
          if (!prev) return prev
          const others = prev.filter((c) => c.jid !== evt.chat!.jid)
          const next = [evt.chat!, ...others]
          next.sort((a, b) => b.last_message_ts - a.last_message_ts)
          return next
        })
      }
    })
    return close
  }, [queryClient])

  // Mark-read on chat open: bumps unread back to 0 and refreshes the row.
  useEffect(() => {
    if (!selectedJID) return
    markWhatsAppChatRead(selectedJID)
      .then(() => queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }))
      .catch(() => {})
  }, [selectedJID, queryClient])

  const sortedChats = useMemo(() => {
    const list = chatsQuery.data ?? []
    return [...list].sort((a, b) => b.last_message_ts - a.last_message_ts)
  }, [chatsQuery.data])

  const selectedChat = useMemo(
    () => sortedChats.find((c) => c.jid === selectedJID) ?? null,
    [sortedChats, selectedJID],
  )

  const pauseMutation = useMutation({
    mutationFn: ({ jid, paused }: { jid: string; paused: boolean }) =>
      pauseWhatsAppChat(jid, paused),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY })
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err))
    },
  })

  const sendMutation = useMutation({
    mutationFn: ({ jid, content }: { jid: string; content: string }) =>
      sendWhatsAppManual(jid, content),
    onSuccess: () => {
      setDraft("")
      if (selectedJID) {
        void queryClient.invalidateQueries({
          queryKey: messagesQueryKey(selectedJID),
        })
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err))
    },
  })

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.whatsapp_inbox", "WhatsApp Inbox")} />
      <div className="flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-[320px_1fr] border-t">
          <ChatsSidebar
            chats={sortedChats}
            selectedJID={selectedJID}
            onSelect={setSelectedJID}
            loading={chatsQuery.isLoading}
          />
          <ConversationPane
            chat={selectedChat}
            messages={messagesQuery.data ?? []}
            loadingMessages={messagesQuery.isLoading}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => {
              if (selectedJID && draft.trim()) {
                sendMutation.mutate({ jid: selectedJID, content: draft.trim() })
              }
            }}
            sending={sendMutation.isPending}
            onTogglePause={(paused) => {
              if (selectedJID) {
                pauseMutation.mutate({ jid: selectedJID, paused })
              }
            }}
            togglingPause={pauseMutation.isPending}
          />
        </div>
      </div>
    </div>
  )
}

interface ChatsSidebarProps {
  chats: WhatsAppChat[]
  selectedJID: string | null
  onSelect: (jid: string) => void
  loading: boolean
}

function ChatsSidebar({
  chats,
  selectedJID,
  onSelect,
  loading,
}: ChatsSidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="bg-muted/20 flex h-full min-h-0 flex-col border-r">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">
          {t("pages.agent.whatsapp.chats", "Conversas")}
        </h2>
        <p className="text-muted-foreground text-xs">
          {chats.length} {t("pages.agent.whatsapp.chats_count", "contatos")}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && chats.length === 0 ? (
          <div className="text-muted-foreground p-4 text-sm">
            {t("common.loading", "Carregando...")}
          </div>
        ) : chats.length === 0 ? (
          <div className="text-muted-foreground p-4 text-sm">
            {t(
              "pages.agent.whatsapp.empty",
              "Nenhuma conversa ainda. Quando alguém mandar mensagem, aparece aqui.",
            )}
          </div>
        ) : (
          <ul className="divide-border/40 divide-y">
            {chats.map((chat) => (
              <ChatRow
                key={chat.jid}
                chat={chat}
                active={chat.jid === selectedJID}
                onClick={() => onSelect(chat.jid)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function ChatRow({
  chat,
  active,
  onClick,
}: {
  chat: WhatsAppChat
  active: boolean
  onClick: () => void
}) {
  const displayName = chat.display_name || chat.push_name || formatJID(chat.jid)
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors " +
          (active ? "bg-primary/10" : "hover:bg-muted/40")
        }
      >
        <Avatar name={displayName} url={chat.avatar_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <span className="text-muted-foreground shrink-0 text-[10px]">
              {formatRelativeTS(chat.last_message_ts)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {chat.paused ? (
              <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-600 uppercase ring-1 ring-amber-500/30 ring-inset dark:text-amber-400">
                pausado
              </span>
            ) : null}
            <p className="text-muted-foreground line-clamp-1 flex-1 text-xs">
              {chat.last_direction === "out" ? "✓ " : ""}
              {chat.last_preview || "—"}
            </p>
            {chat.unread_count > 0 && !active ? (
              <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                {chat.unread_count}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  )
}

interface ConversationPaneProps {
  chat: WhatsAppChat | null
  messages: WhatsAppMessage[]
  loadingMessages: boolean
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  sending: boolean
  onTogglePause: (paused: boolean) => void
  togglingPause: boolean
}

function ConversationPane({
  chat,
  messages,
  loadingMessages,
  draft,
  onDraftChange,
  onSend,
  sending,
  onTogglePause,
  togglingPause,
}: ConversationPaneProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Auto-scroll to the bottom on new messages — messages are stored newest
    // first but we reverse for display so the newest is at the bottom.
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, chat?.jid])

  const activeJID = chat?.jid ?? ""
  const profileQuery = useQuery({
    queryKey: ["whatsapp", "profile", activeJID],
    queryFn: () => getWhatsAppContactProfile(activeJID),
    enabled: activeJID !== "",
    retry: false,
  })
  const insightQuery = useQuery({
    queryKey: ["whatsapp", "insights", activeJID],
    queryFn: () => getWhatsAppConversationInsight(activeJID),
    enabled: activeJID !== "",
    retry: false,
  })

  if (!chat) {
    return (
      <section className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        {t(
          "pages.agent.whatsapp.select_chat",
          "Selecione uma conversa à esquerda para começar.",
        )}
      </section>
    )
  }

  const displayName = chat.display_name || chat.push_name || formatJID(chat.jid)
  const orderedMessages = [...messages].reverse()

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={displayName} url={chat.avatar_url} />
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              {displayName}
            </h3>
            <p className="text-muted-foreground text-xs">
              {formatJID(chat.jid)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={
              chat.paused
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }
          >
            {chat.paused
              ? t("pages.agent.whatsapp.agent_paused", "Agente pausado")
              : t("pages.agent.whatsapp.agent_active", "Agente ativo")}
          </span>
          <Switch
            checked={chat.paused}
            disabled={togglingPause}
            onCheckedChange={(value) => onTogglePause(value)}
            aria-label="pause agent"
          />
        </div>
      </header>
      <ContactContextStrip
        profile={profileQuery.data ?? null}
        insight={insightQuery.data ?? null}
      />

      <div
        ref={scrollRef}
        className="bg-muted/10 min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4"
      >
        {loadingMessages ? (
          <p className="text-muted-foreground text-sm">
            {t("common.loading", "Carregando...")}
          </p>
        ) : orderedMessages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t(
              "pages.agent.whatsapp.no_messages",
              "Sem mensagens nessa conversa ainda.",
            )}
          </p>
        ) : (
          orderedMessages.map((msg) => <Bubble key={msg.id} msg={msg} />)
        )}
      </div>

      <footer className="bg-background border-t px-4 py-3">
        {chat.paused ? null : (
          <p className="text-muted-foreground mb-2 text-[11px]">
            {t(
              "pages.agent.whatsapp.warning_not_paused",
              "Atenção: o agente está ativo. Pause antes de responder manualmente para evitar respostas duplicadas.",
            )}
          </p>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) onSend()
          }}
        >
          <Input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={t(
              "pages.agent.whatsapp.placeholder",
              "Mensagem manual (estilo atendente)…",
            )}
            disabled={sending}
          />
          <Button type="submit" disabled={!draft.trim() || sending}>
            {sending
              ? t("common.sending", "Enviando…")
              : t("pages.agent.whatsapp.send", "Enviar")}
          </Button>
        </form>
      </footer>
    </section>
  )
}

function ContactContextStrip({
  profile,
  insight,
}: {
  profile: WhatsAppContactProfile | null
  insight: WhatsAppConversationInsight | null
}) {
  if (!profile && !insight) return null
  const labels = [
    profile?.intent || insight?.intent,
    profile?.lead_stage || insight?.lead_stage,
    profile?.priority || insight?.priority,
    profile?.consent_status && profile.consent_status !== "unknown"
      ? profile.consent_status
      : "",
  ].filter((label): label is string => Boolean(label))

  return (
    <div className="border-b px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {profile?.name || profile?.phone ? (
          <span className="text-xs font-medium">
            {profile.name || profile.phone}
          </span>
        ) : null}
        {labels.map((label) => (
          <span
            key={label}
            className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
          >
            {label}
          </span>
        ))}
        {profile?.tags?.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium"
          >
            {tag}
          </span>
        ))}
      </div>
      {insight?.next_action || profile?.next_action ? (
        <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
          {insight?.next_action || profile?.next_action}
        </p>
      ) : null}
    </div>
  )
}

function Bubble({ msg }: { msg: WhatsAppMessage }) {
  const isOut = msg.direction === "out"
  const isHuman = msg.source === "human"
  const align = isOut ? "items-end" : "items-start"
  const bubble = isOut
    ? isHuman
      ? "bg-sky-500/15 text-foreground"
      : "bg-emerald-500/15 text-foreground"
    : "bg-card text-foreground"
  const label = isOut ? (isHuman ? "Você" : "Agente") : ""

  return (
    <div className={`flex flex-col gap-0.5 ${align}`}>
      <div
        className={`${bubble} max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm`}
      >
        {label ? (
          <div className="text-muted-foreground mb-0.5 text-[10px] tracking-wider uppercase">
            {label}
          </div>
        ) : null}
        <div className="break-words whitespace-pre-wrap">{msg.content}</div>
        {msg.error ? (
          <div className="text-destructive mt-1 text-[10px]">
            falha: {msg.error}
          </div>
        ) : null}
      </div>
      <div className="text-muted-foreground text-[10px]">
        {formatClock(msg.ts)}
      </div>
    </div>
  )
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="size-10 shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    )
  }
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
      {initials || "?"}
    </div>
  )
}

function formatJID(jid: string): string {
  const [user] = jid.split("@")
  if (!user) return jid
  if (/^\d+$/.test(user)) {
    return `+${user}`
  }
  return user
}

function formatRelativeTS(ts: number): string {
  if (!ts) return ""
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return formatClock(ts)
  }
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`
}

function formatClock(ts: number): string {
  if (!ts) return ""
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`
}
