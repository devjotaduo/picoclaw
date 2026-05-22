import {
  IconBrandWhatsapp,
  IconBuilding,
  IconCamera,
  IconLoader2,
  IconMapPin,
  IconMessageCircle,
  IconNotes,
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
  disconnectWhatsAppNative,
  getChannelConfig,
  getWhatsAppNativeQR,
  patchAppConfig,
} from "@/api/channels"
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
  markWhatsAppChatUnread,
  pauseWhatsAppChat,
  saveWhatsAppContactProfile,
  sendWhatsAppManual,
} from "@/api/whatsapp"
import { WhatsAppNativeForm } from "@/components/channels/channel-forms/whatsapp-native-form"
import { PageHeader } from "@/components/page-header"
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
import { useSidebar } from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import { useAgentAutoPause } from "@/hooks/whatsapp/use-agent-auto-pause"
import { useConversationSearch } from "@/hooks/whatsapp/use-conversation-search"
import { useDragDropFiles } from "@/hooks/whatsapp/use-drag-drop-files"
import { useGlobalShortcuts } from "@/hooks/whatsapp/use-global-shortcuts"
import { useInboxConnection } from "@/hooks/whatsapp/use-inbox-connection"
import { useInternalNotes } from "@/hooks/whatsapp/use-internal-notes"
import { usePendingMessages } from "@/hooks/whatsapp/use-pending-messages"
import { useTypingWindow } from "@/hooks/whatsapp/use-typing-window"
import { attachmentPlaceholder } from "@/lib/whatsapp/attachment-placeholder"
import {
  type ConversationFilter,
  type ConversationSort,
  applyFilter,
  applySort,
  collectTags,
} from "@/lib/whatsapp/conversation-filter"
import { formatJID } from "@/lib/whatsapp/format"
import { truncatePreview } from "@/lib/whatsapp/quote"
import { refreshGatewayState } from "@/store/gateway"

import { ChatHeader } from "./chat/chat-header"
import { CommandPalette } from "./chat/command-palette"
import { ContactAvatar } from "./chat/contact-avatar"
import { ConversationFilters } from "./chat/conversation-filters"
import { ConversationListItem } from "./chat/conversation-list-item"
import { ConversationSearch } from "./chat/conversation-search"
import { DragDropOverlay } from "./chat/drag-drop-overlay"
import { EmptyConversationIllustration } from "./chat/empty-conversation-illustration"
import { InboxSettingsMenu } from "./chat/inbox-settings-menu"
import { type LifecycleAction, LifecycleMenu } from "./chat/lifecycle-menu"
import { MessageInput, type MessageInputHandle } from "./chat/message-input"
import { MessageList } from "./chat/message-list"
import { type ReplyTarget } from "./chat/reply-preview"

const CHATS_QUERY_KEY = ["whatsapp", "chats"]
const messagesQueryKey = (jid: string) => ["whatsapp", "messages", jid]
const WHATSAPP_NATIVE_CONFIG_QUERY_KEY = [
  "channels",
  "whatsapp_native",
  "config",
] as const
const WHATSAPP_NATIVE_QR_QUERY_KEY = ["whatsapp_native", "qr", "inbox"] as const

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asBool(value: unknown): boolean {
  return value === true
}

// ─── main page ────────────────────────────────────────────────────────────────

interface WhatsAppInboxPageProps {
  initialJID?: string
}

export function WhatsAppInboxPage({ initialJID }: WhatsAppInboxPageProps = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()
  const [selectedJID, setSelectedJID] = useState<string | null>(
    initialJID ?? null,
  )
  const [draft, setDraft] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [mobileView, setMobileView] = useState<"list" | "chat">(
    initialJID ? "chat" : "list",
  )
  const [filter, setFilter] = useState<ConversationFilter>("all")
  const [sort, setSort] = useState<ConversationSort>("recent")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pauseChannelOpen, setPauseChannelOpen] = useState(false)
  const [disconnectChannelOpen, setDisconnectChannelOpen] = useState(false)
  const sidebarCollapsedOnceRef = useRef(false)
  const composerRef = useRef<MessageInputHandle | null>(null)

  useEffect(() => {
    if (sidebarCollapsedOnceRef.current) return
    sidebarCollapsedOnceRef.current = true

    if (isMobile) {
      setOpenMobile(false)
      return
    }

    setOpen(false)
  }, [isMobile, setOpen, setOpenMobile])

  const whatsAppNativeConfigQuery = useQuery({
    queryKey: WHATSAPP_NATIVE_CONFIG_QUERY_KEY,
    queryFn: () => getChannelConfig("whatsapp_native"),
    staleTime: 10_000,
  })
  const whatsAppNativeEnabled = asBool(
    whatsAppNativeConfigQuery.data?.config.enabled,
  )
  const whatsAppNativeStatusQuery = useQuery({
    queryKey: WHATSAPP_NATIVE_QR_QUERY_KEY,
    queryFn: getWhatsAppNativeQR,
    enabled: whatsAppNativeEnabled,
    refetchInterval: whatsAppNativeEnabled ? 5_000 : false,
  })
  const whatsAppNativeStatus = whatsAppNativeStatusQuery.data?.status
  const canRefreshConversations = whatsAppNativeStatus === "confirmed"
  const chatsQuery = useQuery({
    queryKey: CHATS_QUERY_KEY,
    queryFn: () => listWhatsAppChats(150),
    enabled: canRefreshConversations,
    refetchInterval: canRefreshConversations ? 30_000 : false,
  })

  async function setWhatsAppNativeEnabled(enabled: boolean) {
    const currentConfig =
      whatsAppNativeConfigQuery.data ??
      (await getChannelConfig("whatsapp_native"))
    const settings = asRecord(asRecord(currentConfig.config).settings)

    await patchAppConfig({
      channel_list: {
        [currentConfig.config_key]: {
          enabled,
          type: "whatsapp_native",
          settings: {
            ...settings,
            use_native: true,
          },
        },
      },
    })
  }

  const enableWhatsAppNativeMutation = useMutation({
    mutationFn: () => setWhatsAppNativeEnabled(true),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: WHATSAPP_NATIVE_CONFIG_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: WHATSAPP_NATIVE_QR_QUERY_KEY,
        }),
        refreshGatewayState({ force: true }),
      ])
      toast.success("Canal WhatsApp ativado")
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err))
    },
  })

  const pauseWhatsAppNativeMutation = useMutation({
    mutationFn: () => setWhatsAppNativeEnabled(false),
    onSuccess: async () => {
      setPauseChannelOpen(false)
      setSelectedJID(null)
      setMobileView("list")
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: WHATSAPP_NATIVE_CONFIG_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: WHATSAPP_NATIVE_QR_QUERY_KEY,
        }),
        queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }),
        refreshGatewayState({ force: true }),
      ])
      toast.success("Canal WhatsApp pausado")
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err))
    },
  })

  const disconnectWhatsAppNativeMutation = useMutation({
    mutationFn: disconnectWhatsAppNative,
    onSuccess: async () => {
      setDisconnectChannelOpen(false)
      setSelectedJID(null)
      setMobileView("list")
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: WHATSAPP_NATIVE_CONFIG_QUERY_KEY,
        }),
        queryClient.invalidateQueries({
          queryKey: WHATSAPP_NATIVE_QR_QUERY_KEY,
        }),
        queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }),
        refreshGatewayState({ force: true }),
      ])
      toast.success("WhatsApp desconectado")
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err))
    },
  })

  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(selectedJID ?? ""),
    queryFn: () => listWhatsAppMessages(selectedJID ?? "", 200),
    enabled: !!selectedJID && canRefreshConversations,
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
  useInboxConnection(handleInboxEvent, canRefreshConversations)
  const whatsAppNativeChecking =
    whatsAppNativeConfigQuery.isLoading ||
    (whatsAppNativeEnabled &&
      whatsAppNativeStatusQuery.isLoading &&
      !whatsAppNativeStatus)
  const shouldShowWhatsAppNativeSetup =
    whatsAppNativeChecking ||
    whatsAppNativeConfigQuery.isError ||
    !whatsAppNativeEnabled ||
    whatsAppNativeStatusQuery.isError ||
    (whatsAppNativeStatus !== undefined && whatsAppNativeStatus !== "confirmed")

  // Track optimistic message keys so MessageBubble renders the clock icon.
  const { pending: pendingIds, add: addPending } = usePendingMessages()

  // Mark read on chat open.
  useEffect(() => {
    if (!selectedJID || !canRefreshConversations) return
    markWhatsAppChatRead(selectedJID)
      .then(() => queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }))
      .catch(() => {})
  }, [selectedJID, queryClient, canRefreshConversations])

  // Profile cache used by the filter/sort layer. Reads every cached profile
  // out of TanStack Query so the filter chips reflect tags/priorities the
  // operator already loaded (we don't pre-fetch profiles for the whole list).
  // Recomputed on every chat-list update so newly opened profiles get picked
  // up — keying off `chatsQuery.dataUpdatedAt` is intentional even though it
  // looks unused.
  const profilesByJid = useMemo(() => {
    const map: Record<string, WhatsAppContactProfile | undefined> = {}
    const all = queryClient.getQueriesData<WhatsAppContactProfile>({
      queryKey: ["whatsapp", "profile"],
    })
    for (const [key, profile] of all) {
      const jid = Array.isArray(key)
        ? (key[2] as string | undefined)
        : undefined
      if (jid && profile) map[jid] = profile
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, chatsQuery.dataUpdatedAt])

  const allChats = useMemo(() => chatsQuery.data ?? [], [chatsQuery.data])
  const tagOptions = useMemo(() => collectTags(profilesByJid), [profilesByJid])

  const sortedChats = useMemo(() => {
    const filtered = applyFilter(allChats, filter, {
      profilesByJid,
      tag: selectedTag,
    })
    return applySort(filtered, sort, { profilesByJid })
  }, [allChats, filter, profilesByJid, selectedTag, sort])

  const selectedChat = useMemo(
    () => allChats.find((c) => c.jid === selectedJID) ?? null,
    [allChats, selectedJID],
  )
  const showWhatsAppNativeSetupOnly =
    shouldShowWhatsAppNativeSetup && !selectedChat

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

  // Toggle read/unread on the dashboard. Both directions hit the backend
  // (read uses /read, unread uses /unread which bumps unread_count to
  // MAX(1, current) so multi-tab views stay in sync via the SSE chat_update
  // we publish server-side).
  const handleToggleRead = useCallback(
    (chat: WhatsAppChat) => {
      const next = chat.unread_count > 0 ? 0 : 1
      queryClient.setQueryData<WhatsAppChat[]>(CHATS_QUERY_KEY, (prev) => {
        if (!prev) return prev
        return prev.map((c) =>
          c.jid === chat.jid ? { ...c, unread_count: next } : c,
        )
      })
      const op = next === 0 ? markWhatsAppChatRead : markWhatsAppChatUnread
      op(chat.jid)
        .then(() => {
          toast.success(
            next === 0
              ? "Conversa marcada como lida"
              : "Conversa marcada como não lida",
          )
        })
        .catch((err: unknown) => {
          // Roll back optimistic update and surface the failure.
          queryClient.setQueryData<WhatsAppChat[]>(CHATS_QUERY_KEY, (prev) => {
            if (!prev) return prev
            return prev.map((c) =>
              c.jid === chat.jid
                ? { ...c, unread_count: chat.unread_count }
                : c,
            )
          })
          toast.error(err instanceof Error ? err.message : String(err))
        })
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
  const { notifyTyping, resumeNow } = useAgentAutoPause({
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

  const counts = useMemo(() => {
    let unread = 0
    let paused = 0
    let mine = 0
    for (const c of allChats) {
      if (c.unread_count > 0) unread += 1
      if (c.paused) paused += 1
      if (profilesByJid[c.jid]?.assigned_to?.trim()) mine += 1
    }
    return { unread, paused, mine, total: allChats.length }
  }, [allChats, profilesByJid])

  // ↑/↓ navigates the filtered list; Enter opens current; / focuses composer;
  // Ctrl+K opens the global palette.
  const selectedIndex = useMemo(
    () =>
      selectedJID ? sortedChats.findIndex((c) => c.jid === selectedJID) : -1,
    [selectedJID, sortedChats],
  )

  useGlobalShortcuts({
    onPrevConversation: () => {
      if (sortedChats.length === 0) return
      const next =
        selectedIndex <= 0 ? sortedChats.length - 1 : selectedIndex - 1
      const target = sortedChats[next]
      if (target) handleSelectChat(target.jid)
    },
    onNextConversation: () => {
      if (sortedChats.length === 0) return
      const next = (selectedIndex + 1) % sortedChats.length
      const target = sortedChats[next]
      if (target) handleSelectChat(target.jid)
    },
    onOpenCurrent: () => {
      if (sortedChats.length === 0) return
      const target = sortedChats[Math.max(0, selectedIndex)]
      if (target) handleSelectChat(target.jid)
    },
    onOpenCommandPalette: () => setPaletteOpen(true),
    onFocusComposer: () => composerRef.current?.focus(),
    onEscape: () => {
      if (paletteOpen) setPaletteOpen(false)
    },
  })

  const channelActionPending =
    enableWhatsAppNativeMutation.isPending ||
    pauseWhatsAppNativeMutation.isPending ||
    disconnectWhatsAppNativeMutation.isPending

  return (
    <div className="flex h-full flex-col" data-whatsapp-inbox>
      <PageHeader title={t("navigation.whatsapp_inbox", "Caixa WhatsApp")}>
        <InboxSettingsMenu
          onRefresh={() =>
            void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY })
          }
          isRefreshing={chatsQuery.isFetching}
          canRefresh={canRefreshConversations}
          channelEnabled={whatsAppNativeEnabled}
          onPauseChannel={() => setPauseChannelOpen(true)}
          onDisconnectChannel={() => setDisconnectChannelOpen(true)}
          channelActionPending={channelActionPending}
          isPausingChannel={pauseWhatsAppNativeMutation.isPending}
          isDisconnectingChannel={disconnectWhatsAppNativeMutation.isPending}
        />
      </PageHeader>

      <AlertDialog open={pauseChannelOpen} onOpenChange={setPauseChannelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar canal WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              A Caixa WhatsApp para de receber novas conversas pelo canal nativo
              até você ativar novamente. As conversas já salvas continuam no
              histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pauseWhatsAppNativeMutation.isPending}
              onClick={() => pauseWhatsAppNativeMutation.mutate()}
            >
              Pausar canal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={disconnectChannelOpen}
        onOpenChange={setDisconnectChannelOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar este WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão atual será encerrada. Para voltar a usar este número, é
              preciso conectar novamente pelo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnectWhatsAppNativeMutation.isPending}
              onClick={() => disconnectWhatsAppNativeMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-1 overflow-hidden">
        <div
          className={`h-full lg:grid ${
            showWhatsAppNativeSetupOnly
              ? "lg:grid-cols-1"
              : "lg:grid-cols-[340px_minmax(0,1fr)]"
          }`}
        >
          {!showWhatsAppNativeSetupOnly && (
            <ConversationList
              chats={sortedChats}
              selectedJID={selectedJID}
              onSelect={handleSelectChat}
              loading={chatsQuery.isLoading}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onToggleRead={handleToggleRead}
              onTogglePause={handleTogglePauseFromList}
              filter={filter}
              onFilterChange={setFilter}
              sort={sort}
              onSortChange={setSort}
              tagOptions={tagOptions}
              selectedTag={selectedTag}
              onSelectedTagChange={setSelectedTag}
              counts={counts}
              hidden={mobileView === "chat"}
            />
          )}

          <ConversationPanel
            chat={selectedChat}
            messages={messagesQuery.data ?? []}
            loadingMessages={messagesQuery.isLoading}
            composerRef={composerRef}
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
            onResume={resumeNow}
            pendingIds={pendingIds}
            onDeleteLocal={handleDeleteLocal}
            onBack={handleBackToList}
            hidden={mobileView === "list" && !showWhatsAppNativeSetupOnly}
            whatsAppNativeSetup={{
              shouldShow: shouldShowWhatsAppNativeSetup,
              checking: whatsAppNativeChecking,
              enabled: whatsAppNativeEnabled,
              configError: whatsAppNativeConfigQuery.isError
                ? whatsAppNativeConfigQuery.error
                : null,
              activating: enableWhatsAppNativeMutation.isPending,
              onEnable: () => enableWhatsAppNativeMutation.mutate(),
            }}
          />
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        chats={allChats}
        onOpenChat={(chat) => handleSelectChat(chat.jid)}
        actions={[
          {
            id: "refresh",
            label: "Atualizar conversas",
            disabled: !canRefreshConversations || chatsQuery.isFetching,
            onSelect: () =>
              void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }),
          },
          {
            id: "focus-composer",
            label: "Focar campo de mensagem (/)",
            onSelect: () => composerRef.current?.focus(),
          },
        ]}
      />
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
  onToggleRead,
  onTogglePause,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  tagOptions,
  selectedTag,
  onSelectedTagChange,
  counts,
  hidden,
}: {
  chats: WhatsAppChat[]
  selectedJID: string | null
  onSelect: (jid: string) => void
  loading: boolean
  searchQuery: string
  onSearchChange: (v: string) => void
  onToggleRead?: (chat: WhatsAppChat) => void
  onTogglePause?: (chat: WhatsAppChat) => void
  filter: ConversationFilter
  onFilterChange: (f: ConversationFilter) => void
  sort: ConversationSort
  onSortChange: (s: ConversationSort) => void
  tagOptions: readonly string[]
  selectedTag: string | null
  onSelectedTagChange: (tag: string | null) => void
  counts: { total: number; unread: number; paused: number; mine: number }
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
      <div className="border-border/40 border-b px-3 py-3">
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
            className="border-border/60 bg-muted/30 placeholder:text-muted-foreground/60 focus:ring-primary/20 w-full rounded-xl border py-2 pr-8 pl-8 text-xs transition-shadow outline-none focus:ring-2"
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
          <p className="text-foreground/70 mt-1.5 px-1 text-[11px]">
            {filteredChats.length === 0
              ? "Nenhum contato encontrado"
              : `${filteredChats.length} de ${chats.length} conversa${filteredChats.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      <ConversationFilters
        filter={filter}
        onFilterChange={onFilterChange}
        sort={sort}
        onSortChange={onSortChange}
        tagOptions={tagOptions}
        selectedTag={selectedTag}
        onSelectedTagChange={onSelectedTagChange}
        totalCount={counts.total}
        unreadCount={counts.unread}
        pausedCount={counts.paused}
        mineCount={counts.mine}
      />

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

interface WhatsAppNativeSetupPanelState {
  shouldShow: boolean
  checking: boolean
  enabled: boolean
  configError: Error | null
  activating: boolean
  onEnable: () => void
}

function ConversationPanel(props: {
  chat: WhatsAppChat | null
  messages: WhatsAppMessage[]
  loadingMessages: boolean
  composerRef: React.Ref<MessageInputHandle | null>
  draft: string
  onDraftChange: (v: string) => void
  onSend: (content: string) => void
  sending: boolean
  onTogglePause: (paused: boolean) => void
  togglingPause: boolean
  onResume: () => void
  pendingIds: ReadonlySet<number | string>
  onDeleteLocal: (m: WhatsAppMessage) => void
  onBack: () => void
  hidden: boolean
  whatsAppNativeSetup: WhatsAppNativeSetupPanelState
}) {
  if (!props.chat) {
    const showNativeSetup = props.whatsAppNativeSetup.shouldShow

    return (
      <section
        className={`bg-muted/5 flex h-full ${
          showNativeSetup
            ? "items-start justify-center overflow-y-auto p-4 lg:p-6"
            : "items-center justify-center"
        } ${props.hidden ? "hidden lg:flex" : "flex"}`}
        aria-label="Painel de conversa"
      >
        {showNativeSetup ? (
          <WhatsAppNativeSetupState setup={props.whatsAppNativeSetup} />
        ) : (
          <EmptyConversationState />
        )}
      </section>
    )
  }
  return <ConversationView {...props} chat={props.chat} />
}

function ConversationView({
  chat,
  messages,
  loadingMessages,
  composerRef,
  draft,
  onDraftChange,
  onSend,
  sending,
  onTogglePause,
  togglingPause,
  onResume,
  pendingIds,
  onDeleteLocal,
  onBack,
  hidden,
}: {
  chat: WhatsAppChat
  messages: WhatsAppMessage[]
  loadingMessages: boolean
  composerRef: React.Ref<MessageInputHandle | null>
  draft: string
  onDraftChange: (v: string) => void
  onSend: (content: string) => void
  sending: boolean
  onTogglePause: (paused: boolean) => void
  togglingPause: boolean
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
  const { notes, addNote, removeNote } = useInternalNotes(chat.jid)

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

  // Lifecycle handlers: encode "Resolver/Arquivar/Reabrir" onto the profile
  // since the backend has no dedicated lifecycle field yet.
  const saveProfileMutation = useMutation({
    mutationFn: (next: WhatsAppContactProfile) =>
      saveWhatsAppContactProfile(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(["whatsapp", "profile", chat.jid], saved)
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Falha ao salvar perfil",
      ),
  })

  const handleLifecycle = useCallback(
    (action: LifecycleAction) => {
      const base = profileQuery.data
      if (!base) {
        toast.error("Perfil ainda não carregou")
        return
      }
      const next: WhatsAppContactProfile = { ...base }
      const tags = new Set(
        (base.tags ?? []).map((t) => t.trim()).filter(Boolean),
      )
      if (action === "resolve") {
        next.lead_stage = "closed"
        tags.delete("archived")
        toast.success("Conversa marcada como resolvida")
      } else if (action === "archive") {
        tags.add("archived")
        toast.success("Conversa arquivada")
      } else if (action === "reopen") {
        next.lead_stage = "nurturing"
        tags.delete("archived")
        toast.success("Conversa reaberta")
      }
      next.tags = Array.from(tags)
      saveProfileMutation.mutate(next)
    },
    [profileQuery.data, saveProfileMutation],
  )

  const handleAssign = useCallback(
    (operator: string) => {
      const base = profileQuery.data
      if (!base) {
        toast.error("Perfil ainda não carregou")
        return
      }
      saveProfileMutation.mutate({ ...base, assigned_to: operator })
    },
    [profileQuery.data, saveProfileMutation],
  )

  // Operator suggestions: collect every assignee already seen in the cache.
  const operatorSuggestions = useMemo(() => {
    const set = new Set<string>()
    const entries = queryClient.getQueriesData<WhatsAppContactProfile>({
      queryKey: ["whatsapp", "profile"],
    })
    for (const [, profile] of entries) {
      const assigned = profile?.assigned_to?.trim()
      if (assigned) set.add(assigned)
    }
    return Array.from(set).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, profileQuery.dataUpdatedAt])

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
        avatarLoading={
          avatarQuery.isFetching || refreshAvatarMutation.isPending
        }
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
        avatarLoading={
          avatarQuery.isFetching || refreshAvatarMutation.isPending
        }
        onRefreshAvatar={() => refreshAvatarMutation.mutate()}
        profile={profileQuery.data ?? null}
        insight={insightQuery.data ?? null}
        onProfileSaved={(updated) => {
          queryClient.setQueryData(["whatsapp", "profile", chat.jid], updated)
        }}
      />

      <ContactContextBar
        profile={profileQuery.data ?? null}
        insight={insightQuery.data ?? null}
        onOpenProfile={() => setProfileSheetOpen(true)}
        rightSlot={
          <LifecycleMenu
            profile={profileQuery.data ?? null}
            onAction={handleLifecycle}
            onAssignTo={handleAssign}
            operatorSuggestions={operatorSuggestions}
          />
        }
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
          notes={notes}
          searchQuery={searchOpen ? search.query : ""}
          currentMatchId={searchOpen ? search.currentMessageId : null}
          onReply={handleReply}
          onDeleteLocal={onDeleteLocal}
          onRemoveNote={removeNote}
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
        onSaveNote={(body) =>
          void addNote({ content: body, author: "Operador" })
        }
        contactName={displayName}
        inputRef={composerRef}
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
  rightSlot,
}: {
  profile: WhatsAppContactProfile | null
  insight: WhatsAppConversationInsight | null
  onOpenProfile?: () => void
  /** Optional right-aligned slot rendered next to the info icon (SLA + lifecycle menu). */
  rightSlot?: React.ReactNode
}) {
  if (!profile && !insight && !rightSlot) return null

  const priority = profile?.priority || insight?.priority
  const intent = profile?.intent || insight?.intent
  const nextAction = insight?.next_action || profile?.next_action
  const summary = profile?.summary || insight?.summary
  const statusParts = [
    humanizeConversationValue(intent),
    priority && priority !== "none"
      ? {
          high: "prioridade alta",
          medium: "prioridade média",
          low: "prioridade baixa",
        }[priority] || humanizeConversationValue(priority)
      : null,
    insight?.needs_handoff ? "precisa de atendimento" : null,
  ].filter(Boolean)
  const mainText =
    nextAction ||
    summary ||
    statusParts.join(" · ") ||
    "Abrir detalhes do contato"

  return (
    <div className="border-border/40 bg-background/80 border-b px-4 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenProfile}
          className="group block min-w-0 flex-1 cursor-pointer text-left"
          aria-label="Ver perfil completo do contato"
        >
          <p className="text-foreground/75 group-hover:text-foreground line-clamp-1 text-[12px] leading-5 transition-colors">
            {mainText}
          </p>
          {statusParts.length > 0 && nextAction && (
            <p className="text-muted-foreground line-clamp-1 text-[11px]">
              {statusParts.join(" · ")}
            </p>
          )}
        </button>
        {rightSlot && (
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  )
}

function humanizeConversationValue(value?: string): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  const known: Record<string, string> = {
    duvida_geral: "dúvida geral",
    novo: "novo contato",
    new: "novo contato",
    lead: "interessado",
    nurturing: "em acompanhamento",
    qualified: "qualificado",
    closed: "resolvido",
    lost: "encerrado",
  }
  const label =
    known[normalized] ?? normalized.replace(/[_-]+/g, " ").replace(/\s+/g, " ")
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ─── contact profile sheet ───────────────────────────────────────────────────

const LEAD_STAGES = ["new", "lead", "nurturing", "qualified", "closed", "lost"]
const PRIORITIES = ["none", "low", "medium", "high"]
const CONSENT_STATUSES = ["unknown", "opted_in", "opted_out"]

function ProfileNotesSection({ chatJID }: { chatJID: string }) {
  const { notes, removeNote } = useInternalNotes(chatJID)
  if (notes.length === 0) return null
  return (
    <fieldset className="space-y-2 rounded-xl bg-amber-50/60 p-3 dark:bg-amber-950/30">
      <legend className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">
        <IconNotes className="size-3.5" aria-hidden="true" />
        Notas internas ({notes.length})
      </legend>
      <ul className="space-y-2">
        {notes.slice(0, 8).map((note) => (
          <li
            key={note.id}
            className="bg-background/70 rounded-lg p-2 ring-1 ring-amber-200/60 dark:ring-amber-800/40"
          >
            <p className="text-foreground/85 text-xs whitespace-pre-wrap">
              {note.content}
            </p>
            <div className="text-foreground/60 mt-1 flex items-center justify-between text-[10px]">
              <span>
                {note.author} ·{" "}
                {new Date(note.ts).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                type="button"
                onClick={() => removeNote(note.id)}
                className="text-foreground/55 hover:text-destructive transition-colors"
                aria-label="Remover nota"
              >
                Remover
              </button>
            </div>
          </li>
        ))}
      </ul>
      {notes.length > 8 && (
        <p className="text-foreground/60 text-[10px]">
          + {notes.length - 8} notas mais antigas
        </p>
      )}
    </fieldset>
  )
}

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

              <ProfileNotesSection chatJID={chat.jid} />

              {insight && (
                <fieldset className="bg-muted/30 space-y-2 rounded-xl p-3">
                  <legend className="text-foreground/70 text-xs font-semibold tracking-wide uppercase">
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
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs"
                        >
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

function WhatsAppNativeSetupState({
  setup,
}: {
  setup: WhatsAppNativeSetupPanelState
}) {
  if (setup.checking) {
    return (
      <div className="animate-in fade-in-0 flex max-w-md flex-col items-center gap-3 px-6 text-center duration-200">
        <IconLoader2 className="text-muted-foreground size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">
          Verificando conexão do WhatsApp Nativo...
        </p>
      </div>
    )
  }

  if (!setup.enabled || setup.configError) {
    return (
      <div className="animate-in fade-in-0 slide-in-from-bottom-2 my-auto flex max-w-md flex-col items-center gap-5 px-6 text-center duration-300">
        <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          <IconBrandWhatsapp className="size-7" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-foreground text-lg font-semibold">
            Canal WhatsApp pausado
          </h3>
          <p className="text-foreground/70 text-sm leading-relaxed">
            Ative novamente para receber e responder conversas pela Caixa
            WhatsApp.
          </p>
          {setup.configError && (
            <p className="pt-1 text-xs text-red-700 dark:text-red-300">
              {setup.configError.message}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          onClick={setup.onEnable}
          disabled={setup.activating}
        >
          {setup.activating && <IconLoader2 className="size-4 animate-spin" />}
          Ativar canal
        </Button>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 my-auto w-full max-w-md px-4 py-6 duration-300">
      <WhatsAppNativeForm enabled={setup.enabled} compact />
    </div>
  )
}

function EmptyConversationState() {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 flex max-w-md flex-col items-center gap-5 px-6 text-center duration-300">
      <EmptyConversationIllustration className="w-full max-w-[260px]" />
      <div className="space-y-1.5">
        <h3 className="text-foreground text-lg font-semibold">
          Selecione uma conversa para começar
        </h3>
        <p className="text-foreground/70 text-sm leading-relaxed">
          Escolha um contato na lista à esquerda para visualizar as mensagens e
          responder em tempo real.
        </p>
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
