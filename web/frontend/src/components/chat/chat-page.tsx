import { IconPlus } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useAtom } from "jotai"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { type AgentSummary, getInternalAgents } from "@/api/internal-agents"
import { getLauncherPolicy } from "@/api/launcher-policy"
import { AssistantMessage } from "@/components/chat/assistant-message"
import {
  ChatComposer,
  type ChatInputDisabledReason,
} from "@/components/chat/chat-composer"
import { ChatEmptyState } from "@/components/chat/chat-empty-state"
import { ModelSelector } from "@/components/chat/model-selector"
import { PendingHandoffsSidebar } from "@/components/chat/pending-handoffs-sidebar"
import { SessionHistoryMenu } from "@/components/chat/session-history-menu"
import { TypingIndicator } from "@/components/chat/typing-indicator"
import { UserMessage } from "@/components/chat/user-message"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useChatModels } from "@/hooks/use-chat-models"
import { useGateway } from "@/hooks/use-gateway"
import { usePicoChat } from "@/hooks/use-pico-chat"
import { useSessionHistory } from "@/hooks/use-session-history"
import type { ConnectionState } from "@/store/chat"
import type { ChatAttachment } from "@/store/chat"
import { showAssistantDetailsAtom } from "@/store/chat"
import type { GatewayState } from "@/store/gateway"

const MAX_IMAGE_SIZE_BYTES = 7 * 1024 * 1024
const MAX_IMAGE_SIZE_LABEL = "7 MB"
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
])

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("Failed to read file"))
    }
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

function resolveChatInputDisabledReason({
  hasDefaultModel,
  connectionState,
  gatewayState,
  requiresWebSocket,
}: {
  hasDefaultModel: boolean
  connectionState: ConnectionState
  gatewayState: GatewayState
  requiresWebSocket: boolean
}): ChatInputDisabledReason | null {
  if (gatewayState === "unknown") {
    return "gatewayUnknown"
  }

  if (gatewayState === "starting") {
    return "gatewayStarting"
  }

  if (gatewayState === "restarting") {
    return "gatewayRestarting"
  }

  if (gatewayState === "stopping") {
    return "gatewayStopping"
  }

  if (gatewayState === "stopped") {
    return "gatewayStopped"
  }

  if (gatewayState === "error") {
    return "gatewayError"
  }

  if (requiresWebSocket && connectionState === "connecting") {
    return "websocketConnecting"
  }

  if (requiresWebSocket && connectionState === "error") {
    return "websocketError"
  }

  if (requiresWebSocket && connectionState === "disconnected") {
    return "websocketDisconnected"
  }

  if (!hasDefaultModel) {
    return "noDefaultModel"
  }

  return null
}

export function ChatPage() {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasScrolled, setHasScrolled] = useState(false)
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [mainAgent, setMainAgent] = useState<AgentSummary | null>(null)
  const [mainAgentID, setMainAgentID] = useState("main")
  const [showAssistantDetails, setShowAssistantDetails] = useAtom(
    showAssistantDetailsAtom,
  )
  const launcherPolicyQ = useQuery({
    queryKey: ["launcher-policy"],
    queryFn: getLauncherPolicy,
    staleTime: 30_000,
  })

  const {
    messages,
    connectionState,
    isTyping,
    activeSessionId,
    contextUsage,
    sendMessage,
    switchSession,
    newChat,
  } = usePicoChat()

  const selectedAgentID = mainAgentID

  const { state: gwState } = useGateway()
  const isGatewayRunning = gwState === "running"

  const {
    defaultModelName,
    hasAvailableModels,
    apiKeyModels,
    oauthModels,
    localModels,
    handleSetDefault,
  } = useChatModels({ isConnected: isGatewayRunning })
  const hasDefaultModel = Boolean(defaultModelName)
  const canChooseModel =
    apiKeyModels.length > 0 || oauthModels.length > 0 || localModels.length > 0
  const assistantDetailsPolicyReady = launcherPolicyQ.isSuccess
  const canShowReasoning =
    assistantDetailsPolicyReady &&
    launcherPolicyQ.data.ui?.show_reasoning !== false
  const canShowToolCalls =
    assistantDetailsPolicyReady &&
    launcherPolicyQ.data.ui?.show_tool_calls !== false
  const canToggleAssistantDetails = canShowReasoning || canShowToolCalls
  const showChatTitleExtra = false
  const showModelSelector = false
  const showAssistantDetailsToggle = false
  const showNewChatButton = false
  const showSessionHistoryButton = false
  const canShowModelSelector =
    launcherPolicyQ.isSuccess &&
    launcherPolicyQ.data.ui?.show_model_selector !== false
  const chatIntro = launcherPolicyQ.data?.ui?.chat_intro?.trim() || ""
  const quickTasks = (launcherPolicyQ.data?.ui?.quick_tasks ?? []).filter(
    (task) => task.label.trim() && task.prompt.trim(),
  )
  const hasChatHeaderControls =
    showChatTitleExtra &&
    showModelSelector &&
    canChooseModel &&
    canShowModelSelector
  const inputDisabledReason = resolveChatInputDisabledReason({
    hasDefaultModel,
    connectionState,
    gatewayState: gwState,
    requiresWebSocket: true,
  })
  const canInput = inputDisabledReason === null

  const {
    sessions,
    hasMore,
    loadError,
    loadErrorMessage,
    observerRef,
    loadSessions,
    handleDeleteSession,
  } = useSessionHistory({
    activeSessionId,
    onDeletedActiveSession: newChat,
  })

  const syncScrollState = (element: HTMLDivElement) => {
    const { clientHeight, scrollHeight, scrollTop } = element
    setHasScrolled(scrollTop > 0)
    setIsAtBottom(scrollHeight - scrollTop <= clientHeight + 10)
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    syncScrollState(e.currentTarget)
  }

  useEffect(() => {
    let cancelled = false
    getInternalAgents()
      .then((next) => {
        if (cancelled) {
          return
        }
        const nextMainAgentID =
          next.main_agent_id ||
          next.agents.find((agent) => agent.default)?.id ||
          "main"
        setMainAgentID(nextMainAgentID)
        setMainAgent(
          next.agents.find((agent) => agent.id === nextMainAgentID) || null,
        )
      })
      .catch((error) => {
        console.warn("Failed to load chat agents:", error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      if (isAtBottom) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
      syncScrollState(scrollRef.current)
    }
  }, [messages, isTyping, isAtBottom])

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || !canInput) return
    if (
      sendMessage({
        content: input,
        attachments,
        agentID: selectedAgentID,
      })
    ) {
      setInput("")
      setAttachments([])
    }
  }

  const handleAddImages = () => {
    if (!canInput) return
    fileInputRef.current?.click()
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleImageSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""

    if (files.length === 0) {
      return
    }

    const nextAttachments: ChatAttachment[] = []
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        toast.error(
          t("chat.invalidImage", {
            name: file.name,
          }),
        )
        continue
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        toast.error(
          t("chat.imageTooLarge", {
            name: file.name,
            size: MAX_IMAGE_SIZE_LABEL,
          }),
        )
        continue
      }

      try {
        nextAttachments.push({
          type: "image",
          filename: file.name,
          url: await readFileAsDataUrl(file),
        })
      } catch {
        toast.error(
          t("chat.imageReadFailed", {
            name: file.name,
          }),
        )
      }
    }

    if (nextAttachments.length > 0) {
      setAttachments(nextAttachments.slice(0, 1))
    }
  }

  const canSubmit =
    canInput && (Boolean(input.trim()) || attachments.length > 0)

  return (
    <div className="bg-background/95 flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title=""
          className={`transition-shadow ${
            hasScrolled ? "shadow-xs" : "shadow-none"
          }`}
          titleExtra={
            hasChatHeaderControls ? (
              <div className="flex min-w-0 items-center gap-2">
                <ModelSelector
                  defaultModelName={defaultModelName}
                  apiKeyModels={apiKeyModels}
                  oauthModels={oauthModels}
                  localModels={localModels}
                  onValueChange={handleSetDefault}
                />
              </div>
            ) : null
          }
        >
          {showAssistantDetailsToggle && canToggleAssistantDetails && (
            <div className="border-border/60 hidden items-center gap-2 rounded-lg border px-3 py-1.5 sm:flex">
              <span className="text-muted-foreground text-sm">
                {t("chat.showAssistantDetails")}
              </span>
              <Switch
                checked={showAssistantDetails}
                onCheckedChange={setShowAssistantDetails}
                aria-label={t("chat.showAssistantDetails")}
                size="sm"
              />
            </div>
          )}

          {showNewChatButton && (
            <Button
              variant="secondary"
              size="sm"
              onClick={newChat}
              className="h-9 gap-2"
            >
              <IconPlus className="size-4" />
              <span className="hidden sm:inline">{t("chat.newChat")}</span>
            </Button>
          )}

          {showSessionHistoryButton && (
            <SessionHistoryMenu
              sessions={sessions}
              activeSessionId={activeSessionId}
              hasMore={hasMore}
              loadError={loadError}
              loadErrorMessage={loadErrorMessage}
              observerRef={observerRef}
              onOpenChange={(open) => {
                if (open) {
                  void loadSessions(true)
                }
              }}
              onSwitchSession={switchSession}
              onDeleteSession={handleDeleteSession}
            />
          )}
        </PageHeader>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto px-4 py-6 md:px-8 lg:px-24 xl:px-48"
        >
          <div className="mx-auto flex w-full max-w-250 flex-col gap-8 pb-8">
            {messages.length === 0 && !isTyping && (
              <ChatEmptyState
                hasAvailableModels={hasAvailableModels}
                defaultModelName={defaultModelName}
                isConnected={isGatewayRunning}
                agent={mainAgent}
                chatIntro={chatIntro}
                quickTasks={quickTasks}
                disabled={!canInput}
                onQuickTask={(prompt) => {
                  if (!canInput) return
                  if (
                    sendMessage({
                      content: prompt,
                      attachments: [],
                      agentID: selectedAgentID,
                    })
                  ) {
                    setInput("")
                    setAttachments([])
                  }
                }}
              />
            )}

            {messages.map((msg) => {
              if (
                msg.kind === "thought" &&
                (!showAssistantDetails || !canShowReasoning)
              ) {
                return null
              }
              if (
                msg.kind === "tool_calls" &&
                (!showAssistantDetails || !canShowToolCalls)
              ) {
                return null
              }

              return (
                <div key={msg.id} className="flex w-full">
                  {msg.role === "assistant" ? (
                    <AssistantMessage
                      content={msg.content}
                      attachments={msg.attachments}
                      kind={msg.kind}
                      toolCalls={msg.toolCalls}
                      timestamp={msg.timestamp}
                    />
                  ) : (
                    <UserMessage
                      content={msg.content}
                      attachments={msg.attachments}
                    />
                  )}
                </div>
              )
            })}

            {isTyping && <TypingIndicator />}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
          className="hidden"
          onChange={handleImageSelection}
        />

        <ChatComposer
          input={input}
          attachments={attachments}
          onInputChange={setInput}
          onAddImages={handleAddImages}
          onAttachAudio={(audio) => setAttachments([audio])}
          onRemoveAttachment={handleRemoveAttachment}
          onSend={handleSend}
          onContextDetail={() => {
            if (
              sendMessage({
                content: "/context",
                attachments: [],
                agentID: selectedAgentID,
              })
            ) {
              setInput("")
            }
          }}
          inputDisabledReason={inputDisabledReason}
          canSend={canSubmit}
          contextUsage={contextUsage}
        />
      </div>
      <PendingHandoffsSidebar className="hidden xl:flex" />
    </div>
  )
}
