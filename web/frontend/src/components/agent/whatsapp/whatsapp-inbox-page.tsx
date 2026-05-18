import {
  IconBrandWhatsapp,
  IconBuilding,
  IconCamera,
  IconCheck,
  IconCircleOff,
  IconInbox,
  IconInfoCircle,
  IconLoader2,
  IconMapPin,
  IconMessageCircle,
  IconPhone,
  IconSearch,
  IconTags,
  IconUser,
  IconX,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type InboxEvent,
  type WhatsAppChat,
  type WhatsAppContactProfile,
  type WhatsAppConversationInsight,
  type WhatsAppMessage,
  fetchWhatsAppAvatar,
  getWhatsAppContactProfile,
  getWhatsAppConversationInsight,
  listWhatsAppChats,
  listWhatsAppMessages,
  markWhatsAppChatRead,
  pauseWhatsAppChat,
  saveWhatsAppContactProfile,
  sendWhatsAppManual,
} from "@/api/whatsapp"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useConversationSearch } from "@/hooks/whatsapp/use-conversation-search"
import { useDragDropFiles } from "@/hooks/whatsapp/use-drag-drop-files"
import { useAgentAutoPause } from "@/hooks/whatsapp/use-agent-auto-pause"
import { useInboxConnection } from "@/hooks/whatsapp/use-inbox-connection"
import { usePendingMessages } from "@/hooks/whatsapp/use-pending-messages"
import { useTypingWindow } from "@/hooks/whatsapp/use-typing-window"
import { attachmentPlaceholder } from "@/lib/whatsapp/attachment-placeholder"
import { formatJID } from "@/lib/whatsapp/format"
import { truncatePreview } from "@/lib/whatsapp/quote"

import { ChatHeader } from "./chat/chat-header"
import { ContactAvatar } from "./chat/contact-avatar"
import { ConversationListItem } from "./chat/conversation-list-item"
import { ConversationSearch } from "./chat/conversation-search"
import { DragDropOverlay } from "./chat/drag-drop-overlay"
import { InboxSettingsMenu } from "./chat/inbox-settings-menu"
import { MessageInput } from "./chat/message-input"
import { MessageList } from "./chat/message-list"
import { type ReplyTarget } from "./chat/reply-preview"
import { TagList } from "./chat/tag-list"

const CHATS_QUERY_KEY = ["whatsapp", "chats"]
const messagesQueryKey = (jid: string) => ["whatsapp", "messages", jid]

// ─── main page ────────────────────────────────────────────────────────────────

export function WhatsAppInboxPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedJID, setSelectedJID] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")

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

  // Live SSE updates with connection-status tracking.
  const handleInboxEvent = useCallback(
    (evt: InboxEvent) => {
      if (evt.kind === "message" && evt.message) {
        const jid = evt.message.chat_jid
        queryClient.setQueryData<WhatsAppMessage[]>(
          messagesQueryKey(jid),
          (prev) => {
            if (!prev) return prev
            if (prev.some((m) => m.id === evt.message!.id)) return prev
            // Drop matching optimistic entries (negative id with same content).
            const cleaned = prev.filter(
              (m) =>
                !(
                  m.id < 0 &&
                  m.direction === "out" &&
                  m.content.trim() === evt.message!.content.trim()
                ),
            )
            return [evt.message!, ...cleaned]
          },
        )
      }
      if (evt.chat) {
        queryClient.setQueryData<WhatsAppChat[]>(CHATS_QUERY_KEY, (prev) => {
          if (!prev) return prev
          const others = prev.filter((c) => c.jid !== evt.chat!.jid)
          const next = [evt.chat!, ...others]
          next.sort((a, b) => b.last_message_ts - a.last_message_ts)
          return next
        })
      }
    },
    [queryClient],
  )
  const { status: connectionStatus } = useInboxConnection(handleInboxEvent)

  // Track optimistic message keys so MessageBubble renders the clock icon.
  const { pending: pendingIds, add: addPending } = usePendingMessages()

  // Mark read on chat open.
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
    onSuccess: (_data, vars) => {
      // Optimistically update the chat cache so the toggle feels instant.
      queryClient.setQueryData<WhatsAppChat[]>(CHATS_QUERY_KEY, (prev) => {
        if (!prev) return prev
        return prev.map((c) =>
          c.jid === vars.jid ? { ...c, paused: vars.paused } : c,
        )
      })
      void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY })
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : String(err)),
  })

  const sendMutation = useMutation({
    mutationFn: ({ jid, content }: { jid: string; content: string }) =>
      sendWhatsAppManual(jid, content),
    onMutate: ({ jid, content }) => {
      const tempId = -Date.now()
      addPending(tempId)
      queryClient.setQueryData<WhatsAppMessage[]>(
        messagesQueryKey(jid),
        (prev) => {
          const optimistic: WhatsAppMessage = {
            id: tempId,
            chat_jid: jid,
            direction: "out",
            source: "human",
            content,
            ts: Date.now(),
            delivered: false,
            status: "pending",
          }
          return prev ? [optimistic, ...prev] : [optimistic]
        },
      )
      return { tempId }
    },
    onSuccess: (_data, vars) => {
      setDraft("")
      void queryClient.invalidateQueries({
        queryKey: messagesQueryKey(vars.jid),
      })
    },
    onError: (err: unknown, vars, context) => {
      toast.error(err instanceof Error ? err.message : String(err))
      if (context?.tempId != null) {
        queryClient.setQueryData<WhatsAppMessage[]>(
          messagesQueryKey(vars.jid),
          (prev) => prev?.filter((m) => m.id !== context.tempId) ?? prev,
        )
      }
    },
  })

  // Mark a chat unread on the dashboard only (the backend has no /unread
  // endpoint yet — when it lands, swap this for a real mutation). Pinned in
  // the chat cache so the green badge appears immediately and survives until
  // the operator opens the chat (which auto-clears via markRead).
  const handleToggleRead = useCallback(
    (chat: WhatsAppChat) => {
      const next = chat.unread_count > 0 ? 0 : 1
      queryClient.setQueryData<WhatsAppChat[]>(CHATS_QUERY_KEY, (prev) => {
        if (!prev) return prev
        return prev.map((c) =>
          c.jid === chat.jid ? { ...c, unread_count: next } : c,
        )
      })
      if (next === 0) {
        void markWhatsAppChatRead(chat.jid).catch(() => {
          /* tolerate offline */
        })
        toast.success("Conversa marcada como lida")
      } else {
        toast.success("Conversa marcada como não lida")
      }
    },
    [queryClient],
  )

  const handleTogglePauseFromList = useCallback(
    (chat: WhatsAppChat) => {
      pauseMutation.mutate({ jid: chat.jid, paused: !chat.paused })
    },
    [pauseMutation],
  )

  // Remove a single bubble from THIS dashboard's cache only — the contact
  // still sees the message on WhatsApp (we don't have a remote delete API).
  const handleDeleteLocal = useCallback(
    (message: WhatsAppMessage) => {
      queryClient.setQueryData<WhatsAppMessage[]>(
        messagesQueryKey(message.chat_jid),
        (prev) => prev?.filter((m) => m.id !== message.id) ?? prev,
      )
      toast.success("Mensagem removida do dashboard")
    },
    [queryClient],
  )

  const handleAutoPauseChange = useCallback(
    (paused: boolean) => {
      if (selectedJID) pauseMutation.mutate({ jid: selectedJID, paused })
    },
    [pauseMutation, selectedJID],
  )

  // Auto-pause lives at the page level so we can render the chip in the
  // header while the textarea (which fires `notifyTyping`) lives in the
  // composer. The hook itself only flips server state through onChange.
  const { autoPaused, notifyTyping, resumeNow } = useAgentAutoPause({
    paused: selectedChat?.paused ?? false,
    onChange: handleAutoPauseChange,
    enabled: !!selectedChat,
  })

  function handleSelectChat(jid: string) {
    setSelectedJID(jid)
    setDraft("")
    setMobileView("chat")
  }
  function handleBackToList() {
    setMobileView("list")
  }

  const unreadTotal = useMemo(
    () => sortedChats.reduce((sum, c) => sum + (c.unread_count > 0 ? 1 : 0), 0),
    [sortedChats],
  )

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("navigation.whatsapp_inbox", "Caixa WhatsApp")}>
        <InboxSettingsMenu
          onRefresh={() =>
            void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY })
          }
          isRefreshing={chatsQuery.isFetching}
        />
      </PageHeader>

      <div className="flex-1 overflow-hidden">
        <div className="h-full lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
          <ConversationList
            chats={sortedChats}
            selectedJID={selectedJID}
            onSelect={handleSelectChat}
            loading={chatsQuery.isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            unreadTotal={unreadTotal}
            onToggleRead={handleToggleRead}
            onTogglePause={handleTogglePauseFromList}
            hidden={mobileView === "chat"}
          />

          <ConversationPanel
            chat={selectedChat}
            messages={messagesQuery.data ?? []}
            loadingMessages={messagesQuery.isLoading}
            draft={draft}
            onDraftChange={(v) => {
              setDraft(v)
              if (v.trim()) notifyTyping()
            }}
            onSend={(content) => {
              if (selectedJID && content.trim()) {
                sendMutation.mutate({
                  jid: selectedJID,
                  content,
                })
              }
            }}
            sending={sendMutation.isPending}
            onTogglePause={(paused) => {
              if (selectedJID)
                pauseMutation.mutate({ jid: selectedJID, paused })
            }}
            togglingPause={pauseMutation.isPending}
            connectionStatus={connectionStatus}
            autoPaused={autoPaused}
            onResume={resumeNow}
            pendingIds={pendingIds}
            onDeleteLocal={handleDeleteLocal}
            onBack={handleBackToList}
            hidden={mobileView === "list"}
          />
        </div>
      </div>
    </div>
  )
}

// ─── conversation list (left panel) ──────────────────────────────────────────

function ConversationList({
  chats,
  selectedJID,
  onSelect,
  loading,
  searchQuery,
  onSearchChange,
  unreadTotal,
  onToggleRead,
  onTogglePause,
  hidden,
}: {
  chats: WhatsAppChat[]
  selectedJID: string | null
  onSelect: (jid: string) => void
  loading: boolean
  searchQuery: string
  onSearchChange: (v: string) => void
  unreadTotal: number
  onToggleRead?: (chat: WhatsAppChat) => void
  onTogglePause?: (chat: WhatsAppChat) => void
  hidden: boolean
}) {
  const { t } = useTranslation()
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(
      (c) =>
        (c.display_name ?? "").toLowerCase().includes(q) ||
        (c.push_name ?? "").toLowerCase().includes(q) ||
        formatJID(c.jid).toLowerCase().includes(q),
    )
  }, [chats, searchQuery])

  const hasSearch = searchQuery.trim() !== ""

  return (
    <aside
      className={`border-border/40 bg-background flex h-full min-h-0 flex-col border-r ${
        hidden ? "hidden lg:flex" : "flex"
      }`}
      aria-label="Lista de conversas"
    >
      <div className="border-border/40 flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#25d366]/10">
            <IconBrandWhatsapp className="size-4 text-[#25d366]" />
          </div>
          <div>
            <h2 className="text-sm leading-none font-semibold">
              {t("pages.agent.whatsapp.chats", "Conversas")}
            </h2>
            <p className="text-foreground/65 mt-0.5 text-[12px]">
              {loading ? "…" : `${chats.length} contatos`}
              {unreadTotal > 0 && (
                <span className="ml-1.5 font-medium text-[#25d366]">
                  · {unreadTotal} não lidas
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="border-border/40 border-b px-3 py-2.5">
        <div className="relative">
          <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            ref={searchRef}
            type="search"
            role="searchbox"
            aria-label="Buscar conversas"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t(
              "pages.agent.whatsapp.search_placeholder",
              "Buscar nome, telefone…",
            )}
            className="border-border/60 bg-muted/30 placeholder:text-muted-foreground/60 focus:ring-primary/20 w-full rounded-xl border py-2 pr-8 pl-8 text-xs outline-none transition-shadow focus:ring-2"
          />
          {hasSearch && (
            <button
              type="button"
              onClick={() => {
                onSearchChange("")
                searchRef.current?.focus()
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 transition-colors"
              aria-label="Limpar busca"
            >
              <IconX className="size-3.5" />
            </button>
          )}
        </div>
        {hasSearch && (
          <p className="text-foreground/55 mt-1.5 px-1 text-[11px]">
            {filteredChats.length === 0
              ? "Nenhum contato encontrado"
              : `${filteredChats.length} de ${chats.length} conversa${filteredChats.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        role="list"
        aria-label="Conversas"
      >
        {loading && chats.length === 0 ? (
          <ConversationListSkeleton />
        ) : chats.length === 0 ? (
          <EmptyListState />
        ) : filteredChats.length === 0 ? (
          <SearchEmptyState query={searchQuery} />
        ) : (
          <div className="space-y-0 py-1">
            {filteredChats.map((chat) => (
              <ConversationListItem
                key={chat.jid}
                chat={chat}
                selected={chat.jid === selectedJID}
                onSelect={() => onSelect(chat.jid)}
                onToggleRead={onToggleRead}
                onTogglePause={onTogglePause}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

// ─── conversation panel (right) ──────────────────────────────────────────────

function ConversationPanel(props: {
  chat: WhatsAppChat | null
  messages: WhatsAppMessage[]
  loadingMessages: boolean
  draft: string
  onDraftChange: (v: string) => void
  onSend: (content: string) => void
  sending: boolean
  onTogglePause: (paused: boolean) => void
  togglingPause: boolean
  connectionStatus: ReturnType<typeof useInboxConnection>["status"]
  autoPaused: boolean
  onResume: () => void
  pendingIds: ReadonlySet<number | string>
  onDeleteLocal: (m: WhatsAppMessage) => void
  onBack: () => void
  hidden: boolean
}) {
  if (!props.chat) {
    return (
      <section
        className={`bg-muted/5 flex h-full items-center justify-center ${
          props.hidden ? "hidden lg:flex" : "flex"
        }`}
        aria-label="Painel de conversa"
      >
        <EmptyConversationState />
      </section>
    )
  }
  return <ConversationView {...props} chat={props.chat} />
}

function ConversationView({
  chat,
  messages,
  loadingMessages,
  draft,
  onDraftChange,
  onSend,
  sending,
  onTogglePause,
  togglingPause,
  connectionStatus,
  autoPaused,
  onResume,
  pendingIds,
  onDeleteLocal,
  onBack,
  hidden,
}: {
  chat: WhatsAppChat
  messages: WhatsAppMessage[]
  loadingMessages: boolean
  draft: string
  onDraftChange: (v: string) => void
  onSend: (content: string) => void
  sending: boolean
  onTogglePause: (paused: boolean) => void
  togglingPause: boolean
  connectionStatus: ReturnType<typeof useInboxConnection>["status"]
  autoPaused: boolean
  onResume: () => void
  pendingIds: ReadonlySet<number | string>
  onDeleteLocal: (m: WhatsAppMessage) => void
  onBack: () => void
  hidden: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [profileSheetOpen, setProfileSheetOpen] = useState(false)
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const displayName = chat.display_name || chat.push_name || formatJID(chat.jid)
  const orderedMessages = useMemo(() => [...messages].reverse(), [messages])

  // Typing indicator: the contact is "typing" if `chat.typing_at` is fresher
  // than 5s ago. The hook polls so the indicator clears even when the gateway
  // never sends a "stopped typing" event.
  const isContactTyping = useTypingWindow(chat.typing_at)

  const search = useConversationSearch({ messages: orderedMessages })

  const { rootRef, isDragging } = useDragDropFiles({
    onFiles: (files) => {
      const content = attachmentPlaceholder("document", files)
      onSend(content)
    },
  })

  const avatarQuery = useQuery({
    queryKey: ["whatsapp", "avatar", chat.jid],
    queryFn: () => fetchWhatsAppAvatar(chat.jid),
    retry: false,
    staleTime: 4 * 60 * 1000,
  })
  const avatarUrl = avatarQuery.data?.url ?? chat.avatar_url

  const refreshAvatarMutation = useMutation({
    mutationFn: () => fetchWhatsAppAvatar(chat.jid, true),
    onSuccess: (data) => {
      queryClient.setQueryData(["whatsapp", "avatar", chat.jid], data)
      toast.success("Foto de perfil atualizada")
    },
    onError: () => toast.error("Não foi possível atualizar a foto"),
  })

  const profileQuery = useQuery({
    queryKey: ["whatsapp", "profile", chat.jid],
    queryFn: () => getWhatsAppContactProfile(chat.jid),
    retry: false,
  })
  const insightQuery = useQuery({
    queryKey: ["whatsapp", "insights", chat.jid],
    queryFn: () => getWhatsAppConversationInsight(chat.jid),
    retry: false,
  })

  const handleReply = useCallback((m: WhatsAppMessage) => {
    setReplyTarget({
      id: m.id,
      preview: truncatePreview(m.content, 200),
      isOut: m.direction === "out",
      authorLabel:
        m.direction === "out"
          ? m.source === "agent"
            ? "Agente"
            : "Operador"
          : "Contato",
    })
  }, [])

  const handleSend = useCallback(
    (content: string) => {
      onSend(content)
      setReplyTarget(null)
    },
    [onSend],
  )

  // Ctrl/⌘+F opens the in-conversation search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <section
      ref={rootRef}
      className={`relative flex h-full min-h-0 flex-col ${hidden ? "hidden lg:flex" : "flex"}`}
      aria-label={`Conversa com ${displayName}`}
    >
      <ChatHeader
        chat={chat}
        displayName={displayName}
        avatarUrl={avatarUrl}
        avatarLoading={avatarQuery.isFetching || refreshAvatarMutation.isPending}
        autoPaused={autoPaused}
        connectionStatus={connectionStatus}
        togglingPause={togglingPause}
        isTyping={isContactTyping}
        onTogglePause={onTogglePause}
        onResume={onResume}
        onBack={onBack}
        onOpenProfile={() => setProfileSheetOpen(true)}
        onRefreshAvatar={() => refreshAvatarMutation.mutate()}
        onToggleSearch={() => setSearchOpen((v) => !v)}
        searchOpen={searchOpen}
      />

      <ConversationSearch
        open={searchOpen}
        query={search.query}
        onQueryChange={search.setQuery}
        matchCount={search.matchIndexes.length}
        cursor={search.cursor}
        onPrev={search.prev}
        onNext={search.next}
        onClose={() => {
          setSearchOpen(false)
          search.reset()
        }}
      />

      <ContactProfileSheet
        open={profileSheetOpen}
        onOpenChange={setProfileSheetOpen}
        chat={chat}
        avatarUrl={avatarUrl}
        avatarLoading={avatarQuery.isFetching || refreshAvatarMutation.isPending}
        onRefreshAvatar={() => refreshAvatarMutation.mutate()}
        profile={profileQuery.data ?? null}
        insight={insightQuery.data ?? null}
        onProfileSaved={(updated) => {
          queryClient.setQueryData(
            ["whatsapp", "profile", chat.jid],
            updated,
          )
        }}
      />

      <ContactContextBar
        profile={profileQuery.data ?? null}
        insight={insightQuery.data ?? null}
        onOpenProfile={() => setProfileSheetOpen(true)}
      />

      {loadingMessages ? (
        <div className="bg-muted/5 min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <MessageListSkeleton />
        </div>
      ) : (
        <MessageList
          messages={orderedMessages}
          resetKey={chat.jid}
          pendingIds={pendingIds}
          searchQuery={searchOpen ? search.query : ""}
          currentMatchId={searchOpen ? search.currentMessageId : null}
          onReply={handleReply}
          onDeleteLocal={onDeleteLocal}
          empty={
            <div className="space-y-2 text-center">
              <IconMessageCircle className="text-muted-foreground/30 mx-auto size-10" />
              <p className="text-foreground/60 text-sm">
                {t(
                  "pages.agent.whatsapp.no_messages",
                  "Sem mensagens nessa conversa ainda.",
                )}
              </p>
            </div>
          }
        />
      )}

      <MessageInput
        value={draft}
        onChange={onDraftChange}
        onSend={handleSend}
        sending={sending}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
      />

      <DragDropOverlay visible={isDragging} />
    </section>
  )
}

// ─── contact context bar ──────────────────────────────────────────────────────

function ContactContextBar({
  profile,
  insight,
  onOpenProfile,
}: {
  profile: WhatsAppContactProfile | null
  insight: WhatsAppConversationInsight | null
  onOpenProfile?: () => void
}) {
  if (!profile && !insight) return null

  const leadStage = profile?.lead_stage || insight?.lead_stage
  const priority = profile?.priority || insight?.priority
  const intent = profile?.intent || insight?.intent
  const nextAction = insight?.next_action || profile?.next_action
  const tags = profile?.tags ?? []

  const stageBg: Record<string, string> = {
    qualified:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800",
    lead: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800",
    nurturing:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",
  }
  const priorityBg: Record<string, string> = {
    high: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800",
    medium: "bg-orange-50 text-orange-700 ring-orange-200",
    low: "bg-gray-50 text-gray-600 ring-gray-200",
  }
  const stageClass = leadStage
    ? (stageBg[leadStage] ?? "bg-muted text-muted-foreground ring-border")
    : ""
  const priorityClass = priority
    ? (priorityBg[priority] ?? "bg-muted text-muted-foreground ring-border")
    : ""

  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="border-border/40 bg-muted/20 hover:bg-muted/40 group w-full cursor-pointer border-b px-4 py-2 text-left transition-colors"
      aria-label="Ver perfil completo do contato"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {intent && (
          <span className="bg-muted text-muted-foreground ring-border rounded-full px-2 py-0.5 text-[10px] font-medium ring-1">
            {intent}
          </span>
        )}
        {leadStage && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${stageClass}`}
          >
            {leadStage}
          </span>
        )}
        {priority && priority !== "none" && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${priorityClass}`}
          >
            {priority}
          </span>
        )}
        <TagList tags={tags} limit={3} />
        {insight?.needs_handoff && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800">
            handoff
          </span>
        )}
        <IconInfoCircle
          className="text-muted-foreground/40 group-hover:text-muted-foreground ml-auto size-3 shrink-0 transition-colors"
          aria-hidden="true"
        />
      </div>
      {nextAction && (
        <p className="text-foreground/60 mt-1 line-clamp-1 text-[11px]">
          <span className="bg-muted text-foreground/75 mr-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
            <IconInfoCircle className="size-2.5" aria-hidden="true" />
            Próximo
          </span>
          {nextAction}
        </p>
      )}
    </button>
  )
}

// ─── contact profile sheet ───────────────────────────────────────────────────

const LEAD_STAGES = ["new", "lead", "nurturing", "qualified", "closed", "lost"]
const PRIORITIES = ["none", "low", "medium", "high"]
const CONSENT_STATUSES = ["unknown", "opted_in", "opted_out"]

function ContactProfileSheet({
  open,
  onOpenChange,
  chat,
  avatarUrl,
  avatarLoading,
  onRefreshAvatar,
  profile,
  insight,
  onProfileSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  chat: WhatsAppChat
  avatarUrl?: string
  avatarLoading?: boolean
  onRefreshAvatar: () => void
  profile: WhatsAppContactProfile | null
  insight: WhatsAppConversationInsight | null
  onProfileSaved: (p: WhatsAppContactProfile) => void
}) {
  const displayName = chat.display_name || chat.push_name || formatJID(chat.jid)
  const [draft, setDraft] = useState<Partial<WhatsAppContactProfile>>({})
  const [tagsInput, setTagsInput] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setDraft({
        display_name: profile.display_name ?? "",
        name: profile.name ?? "",
        city: profile.city ?? "",
        company: profile.company ?? "",
        interest: profile.interest ?? "",
        lead_stage: profile.lead_stage,
        priority: profile.priority,
        consent_status: profile.consent_status,
        summary: profile.summary ?? "",
        next_action: profile.next_action ?? "",
        assigned_to: profile.assigned_to ?? "",
        follow_up_reason: profile.follow_up_reason ?? "",
      })
      setTagsInput((profile.tags ?? []).join(", "))
    }
  }, [profile, open])

  const field = (key: keyof typeof draft) => ({
    value: (draft[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((prev) => ({ ...prev, [key]: e.target.value })),
  })

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      const updated = await saveWhatsAppContactProfile({
        ...profile,
        ...draft,
        tags,
      })
      onProfileSaved(updated)
      toast.success("Perfil salvo")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar perfil")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-border/40 shrink-0 border-b px-5 py-4">
          <SheetTitle className="text-base">Perfil do Contato</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-border/40 bg-muted/20 flex flex-col items-center gap-3 border-b px-5 py-6">
            <div className="group relative">
              <ContactAvatar name={displayName} url={avatarUrl} size="lg" />
              <button
                type="button"
                onClick={onRefreshAvatar}
                disabled={avatarLoading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 disabled:cursor-not-allowed"
                aria-label="Atualizar foto"
              >
                {avatarLoading ? (
                  <IconLoader2 className="size-5 animate-spin text-white" />
                ) : (
                  <IconCamera className="size-5 text-white" />
                )}
              </button>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">{displayName}</p>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                <IconPhone className="text-muted-foreground size-3" />
                <p className="text-foreground/65 text-xs">
                  {formatJID(chat.jid)}
                </p>
              </div>
            </div>
          </div>

          {!profile ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <IconUser className="text-muted-foreground/30 size-8" />
              <p className="text-foreground/60 text-sm">
                Perfil ainda não disponível
              </p>
            </div>
          ) : (
            <div className="space-y-5 px-5 py-4">
              <fieldset className="space-y-3">
                <legend className="text-foreground/60 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                  <IconUser className="size-3.5" />
                  Identidade
                </legend>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Nome no dashboard</Label>
                    <Input
                      className="mt-1 h-8 text-sm"
                      placeholder="Ex: João Silva"
                      {...field("display_name")}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nome real</Label>
                    <Input
                      className="mt-1 h-8 text-sm"
                      placeholder="Nome completo"
                      {...field("name")}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-foreground/60 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                  <IconBuilding className="size-3.5" />
                  Empresa & Localização
                </legend>
                <div className="space-y-2">
                  <div>
                    <Label className="flex items-center gap-1 text-xs">
                      <IconBuilding className="size-3" />
                      Empresa
                    </Label>
                    <Input
                      className="mt-1 h-8 text-sm"
                      placeholder="Nome da empresa"
                      {...field("company")}
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1 text-xs">
                      <IconMapPin className="size-3" />
                      Cidade
                    </Label>
                    <Input
                      className="mt-1 h-8 text-sm"
                      placeholder="Cidade"
                      {...field("city")}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-foreground/60 text-xs font-semibold tracking-wide uppercase">
                  CRM
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Estágio</Label>
                    <select
                      className="border-input bg-background focus:ring-ring mt-1 h-8 w-full rounded-md border px-2 text-sm focus:ring-2 focus:outline-none"
                      value={draft.lead_stage ?? profile.lead_stage}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          lead_stage: e.target.value,
                        }))
                      }
                    >
                      {LEAD_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade</Label>
                    <select
                      className="border-input bg-background focus:ring-ring mt-1 h-8 w-full rounded-md border px-2 text-sm focus:ring-2 focus:outline-none"
                      value={draft.priority ?? profile.priority}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          priority: e.target.value,
                        }))
                      }
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Consentimento</Label>
                  <select
                    className="border-input bg-background focus:ring-ring mt-1 h-8 w-full rounded-md border px-2 text-sm focus:ring-2 focus:outline-none"
                    value={draft.consent_status ?? profile.consent_status}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        consent_status: e.target.value,
                      }))
                    }
                  >
                    {CONSENT_STATUSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Interesse</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    placeholder="Produto ou serviço de interesse"
                    {...field("interest")}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1 text-xs">
                    <IconTags className="size-3" />
                    Tags (separadas por vírgula)
                  </Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    placeholder="vip, interessado, follow-up"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                  />
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-foreground/60 text-xs font-semibold tracking-wide uppercase">
                  Ações
                </legend>
                <div>
                  <Label className="text-xs">Próxima ação</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    placeholder="Ex: Ligar na segunda-feira"
                    {...field("next_action")}
                  />
                </div>
                <div>
                  <Label className="text-xs">Responsável</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    placeholder="Nome do atendente"
                    {...field("assigned_to")}
                  />
                </div>
                <div>
                  <Label className="text-xs">Motivo do follow-up</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    placeholder="Motivo para contato futuro"
                    {...field("follow_up_reason")}
                  />
                </div>
                <div>
                  <Label className="text-xs">Resumo</Label>
                  <Textarea
                    className="mt-1 max-h-28 min-h-16 resize-none text-sm"
                    placeholder="Observações sobre o contato"
                    value={(draft.summary as string) ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, summary: e.target.value }))
                    }
                  />
                </div>
              </fieldset>

              {insight && (
                <fieldset className="bg-muted/30 space-y-2 rounded-xl p-3">
                  <legend className="text-foreground/60 text-xs font-semibold tracking-wide uppercase">
                    Análise do Agente (somente leitura)
                  </legend>
                  {insight.summary && (
                    <p className="text-foreground/65 text-xs leading-relaxed">
                      {insight.summary}
                    </p>
                  )}
                  {insight.products.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-foreground/60 text-[10px] font-semibold uppercase">
                        Produtos mencionados
                      </p>
                      {insight.products.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{p.product}</span>
                          {p.quantity && (
                            <span className="text-foreground/60">
                              × {p.quantity}
                            </span>
                          )}
                          {p.price_text && (
                            <span className="text-foreground/60">
                              {p.price_text}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(insight.collected_fields ?? {}).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-foreground/60 text-[10px] font-semibold uppercase">
                        Campos coletados
                      </p>
                      {Object.entries(insight.collected_fields).map(
                        ([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs">
                            <span className="text-foreground/60 capitalize">
                              {k}:
                            </span>
                            <span>{v}</span>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                  {insight.missing_fields.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <p className="text-foreground/60 w-full text-[10px] font-semibold uppercase">
                        Faltando
                      </p>
                      {insight.missing_fields.map((f) => (
                        <span
                          key={f}
                          className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-400"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="border-border/40 shrink-0 gap-2 border-t px-5 py-3">
          <SheetClose asChild>
            <Button variant="outline" size="sm" className="flex-1">
              Cancelar
            </Button>
          </SheetClose>
          <Button
            size="sm"
            className="flex-1"
            disabled={!profile || saving}
            onClick={() => void handleSave()}
          >
            {saving && <IconLoader2 className="mr-1.5 size-3.5 animate-spin" />}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ─── empty states & skeletons ────────────────────────────────────────────────

function EmptyConversationState() {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 flex max-w-sm flex-col items-center gap-4 px-6 text-center duration-300">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-[#25d366]/10">
        <IconBrandWhatsapp className="size-10 text-[#25d366]" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-foreground text-base font-semibold">
          Selecione uma conversa para começar
        </h3>
        <p className="text-foreground/60 text-sm leading-relaxed">
          Escolha um contato na lista à esquerda para visualizar as mensagens
          e responder em tempo real.
        </p>
      </div>
      <div className="bg-muted/40 w-full space-y-2 rounded-xl p-4 text-left">
        <p className="text-foreground/60 text-xs font-medium tracking-wide uppercase">
          Dicas rápidas
        </p>
        <div className="text-foreground/60 space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <IconCircleOff className="size-3.5 shrink-0 text-amber-500" />
            <span>
              Comece a digitar e o agente é pausado automaticamente
            </span>
          </div>
          <div className="flex items-center gap-2">
            <IconCheck className="size-3.5 shrink-0 text-[#25d366]" />
            <span>Ctrl+Enter envia a mensagem manualmente</span>
          </div>
          <div className="flex items-center gap-2">
            <IconInbox className="text-primary size-3.5 shrink-0" />
            <span>
              Conversas com badge verde têm mensagens não lidas
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyListState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-xl">
        <IconMessageCircle className="text-muted-foreground size-7" />
      </div>
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">
          Nenhuma conversa ainda
        </p>
        <p className="text-foreground/60 max-w-xs text-xs leading-relaxed">
          Quando alguém enviar uma mensagem, ela aparecerá aqui automaticamente.
        </p>
      </div>
    </div>
  )
}

function SearchEmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
        <IconSearch className="text-muted-foreground size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">Nenhum resultado</p>
        <p className="text-foreground/60 text-xs">
          Nenhuma conversa encontrada para{" "}
          <span className="font-medium">"{query}"</span>
        </p>
      </div>
    </div>
  )
}

function ConversationListSkeleton() {
  return (
    <div className="space-y-0 py-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="bg-muted size-11 animate-pulse rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <div className="bg-muted h-3.5 w-28 animate-pulse rounded" />
              <div className="bg-muted h-3 w-8 animate-pulse rounded" />
            </div>
            <div className="bg-muted h-3 w-40 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function MessageListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`bg-muted h-12 animate-pulse rounded-2xl ${i % 2 === 0 ? "w-48 rounded-tr-sm" : "w-64 rounded-tl-sm"}`}
          />
        </div>
      ))}
    </div>
  )
}
