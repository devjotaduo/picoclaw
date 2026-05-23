import { IconPlus } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useAtom } from "jotai"
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { type AgentSummary, getInternalAgents } from "@/api/internal-agents"
import { getLauncherPolicy } from "@/api/launcher-policy"
import type { AuraPalette } from "@/components/chat/ai-orb-avatar"
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
import { useUIVisibility } from "@/hooks/use-ui-visibility"
import { groupChatSuggestionMessages } from "@/lib/chat-suggestion-card"
import type { ConnectionState } from "@/store/chat"
import type { ChatAttachment } from "@/store/chat"
import { showAssistantDetailsAtom } from "@/store/chat"
import type { GatewayState } from "@/store/gateway"

const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENT_SIZE_LABEL = "20 MB"
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
])
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
])
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "json",
  "md",
  "pdf",
  "ppt",
  "pptx",
  "txt",
  "xls",
  "xlsx",
])
const DOCUMENT_EXTENSION_CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/bmp,application/pdf,text/plain,text/markdown,text/csv,application/json,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
const PUBLIC_ATTENDANT_FALLBACK_ID = "assistente"
const PUBLIC_ATTENDANT_FALLBACK_NAME = "Atendente público"
const PUBLIC_ATTENDANT_DESCRIPTION =
  "Atendimento inicial da empresa para receber clientes, tirar dúvidas simples e encaminhar quando precisar."
const PUBLIC_ATTENDANT_AURA: AuraPalette = [
  "#22C55E",
  "#0EA5E9",
  "#F59E0B",
  "#EC4899",
]

function agentSearchText(agent: AgentSummary): string {
  const roleConfig = (() => {
    try {
      return JSON.stringify(agent.role_config ?? {})
    } catch {
      return ""
    }
  })()

  return `${agent.id} ${agent.name} ${roleConfig}`.toLowerCase()
}

function findPublicAttendantAgent(agents: AgentSummary[]): AgentSummary | null {
  const allowedAgents = agents.filter((agent) => {
    const text = agentSearchText(agent)
    return agent.allowed && agent.id !== "main" && !text.includes("rafael")
  })
  return (
    allowedAgents.find((agent) => agentSearchText(agent).includes("clara")) ||
    allowedAgents.find((agent) => agent.id === PUBLIC_ATTENDANT_FALLBACK_ID) ||
    allowedAgents.find((agent) =>
      agentSearchText(agent).includes("atendente"),
    ) ||
    allowedAgents.find((agent) => agentSearchText(agent).includes("sofia")) ||
    null
  )
}

function publicAttendantLabel(agent: AgentSummary | null): string {
  if (!agent) {
    return PUBLIC_ATTENDANT_FALLBACK_NAME
  }
  const text = agentSearchText(agent)
  if (
    agent.id === PUBLIC_ATTENDANT_FALLBACK_ID &&
    !text.includes("atendente") &&
    !text.includes("clara")
  ) {
    return PUBLIC_ATTENDANT_FALLBACK_NAME
  }
  return (agent?.name || "").trim() || PUBLIC_ATTENDANT_FALLBACK_NAME
}

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

function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".")
  if (lastDot < 0 || lastDot === name.length - 1) {
    return ""
  }
  return name.slice(lastDot + 1).toLowerCase()
}

function isSupportedAttachment(file: File): boolean {
  if (
    ALLOWED_IMAGE_TYPES.has(file.type) ||
    ALLOWED_DOCUMENT_TYPES.has(file.type)
  ) {
    return true
  }

  return ALLOWED_DOCUMENT_EXTENSIONS.has(getFileExtension(file.name))
}

function resolveAttachmentType(file: File): ChatAttachment["type"] {
  return file.type.startsWith("image/") ? "image" : "file"
}

function resolveAttachmentContentType(file: File): string | undefined {
  if (file.type) {
    return file.type
  }
  return DOCUMENT_EXTENSION_CONTENT_TYPES[getFileExtension(file.name)]
}

function normalizeDataUrlContentType(
  url: string,
  contentType?: string,
): string {
  if (!contentType) {
    return url
  }
  return url.replace(/^data:[^;,]*(?=;base64,)/, `data:${contentType}`)
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
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [testingPublicAttendant, setTestingPublicAttendant] = useState(false)
  const [showAssistantDetails, setShowAssistantDetails] = useAtom(
    showAssistantDetailsAtom,
  )
  const launcherPolicyQ = useQuery({
    queryKey: ["launcher-policy"],
    queryFn: getLauncherPolicy,
    staleTime: 30_000,
  })
  const { visible: isVisible } = useUIVisibility(launcherPolicyQ.data)

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
  const displayMessages = useMemo(
    () => groupChatSuggestionMessages(messages),
    [messages],
  )

  const publicAttendantAgent = useMemo(
    () => findPublicAttendantAgent(agents),
    [agents],
  )
  const publicAttendantAgentID = publicAttendantAgent?.id || mainAgentID
  const selectedAgentID = testingPublicAttendant
    ? publicAttendantAgentID
    : mainAgentID
  const activeAgent = testingPublicAttendant ? publicAttendantAgent : mainAgent
  const assistantName = testingPublicAttendant
    ? publicAttendantLabel(publicAttendantAgent)
    : (mainAgent?.name || mainAgent?.id || "").trim()
  const emptyStateDescription = testingPublicAttendant
    ? PUBLIC_ATTENDANT_DESCRIPTION
    : undefined

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
    isVisible("chat.reasoning_messages") &&
    assistantDetailsPolicyReady &&
    launcherPolicyQ.data.ui?.show_reasoning !== false
  const canShowToolCalls =
    isVisible("chat.tool_call_messages") &&
    assistantDetailsPolicyReady &&
    launcherPolicyQ.data.ui?.show_tool_calls !== false
  const canToggleAssistantDetails = canShowReasoning || canShowToolCalls
  const showChatTitleExtra = isVisible("chat.title_extra", false)
  const showModelSelector = isVisible("chat.model_selector", false)
  const showAssistantDetailsToggle = isVisible(
    "chat.assistant_details_toggle",
    false,
  )
  const showNewChatButton = isVisible("chat.new_chat", false)
  const showSessionHistoryButton = isVisible("chat.session_history", false)
  const showAttendantTestButton = isVisible("chat.test_attendant")
  const showPendingHandoffsSidebar = isVisible("chat.pending_handoffs_sidebar")
  const showQualityIndicator = isVisible("chat.quality_indicator")
  const showContextUsage = isVisible("chat.context_usage")
  const showQuickTasks = isVisible("chat.quick_tasks")
  const canShowModelSelector =
    launcherPolicyQ.isSuccess &&
    launcherPolicyQ.data.ui?.show_model_selector !== false
  const chatIntro = launcherPolicyQ.data?.ui?.chat_intro?.trim() || ""
  const quickTasks = showQuickTasks
    ? (launcherPolicyQ.data?.ui?.quick_tasks ?? []).filter(
        (task) => task.label.trim() && task.prompt.trim(),
      )
    : []
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

  useEffect(() => {
    if (!showAttendantTestButton && testingPublicAttendant) {
      setTestingPublicAttendant(false)
    }
  }, [showAttendantTestButton, testingPublicAttendant])

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
        setAgents(next.agents)
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

  const handleSuggestionReply = (content: string) => {
    if (!content.trim() || !canInput) return
    if (
      sendMessage({
        content,
        attachments: [],
        agentID: selectedAgentID,
      })
    ) {
      setInput("")
      setAttachments([])
    }
  }

  const handleAddAttachments = () => {
    if (!canInput) return
    fileInputRef.current?.click()
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleAttachmentSelection = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""

    if (files.length === 0) {
      return
    }

    const nextAttachments: ChatAttachment[] = []
    for (const file of files) {
      if (!isSupportedAttachment(file)) {
        toast.error(
          t("chat.invalidAttachment", {
            name: file.name,
          }),
        )
        continue
      }

      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast.error(
          t("chat.attachmentTooLarge", {
            name: file.name,
            size: MAX_ATTACHMENT_SIZE_LABEL,
          }),
        )
        continue
      }

      try {
        const contentType = resolveAttachmentContentType(file)
        nextAttachments.push({
          type: resolveAttachmentType(file),
          filename: file.name,
          url: normalizeDataUrlContentType(
            await readFileAsDataUrl(file),
            contentType,
          ),
          contentType,
        })
      } catch {
        toast.error(
          t("chat.attachmentReadFailed", {
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
                agent={activeAgent}
                chatIntro={chatIntro}
                displayName={assistantName}
                displayDescription={emptyStateDescription}
                avatarSeed={
                  testingPublicAttendant
                    ? "atendente-publico"
                    : assistantName || activeAgent?.id
                }
                avatarColors={
                  testingPublicAttendant ? PUBLIC_ATTENDANT_AURA : undefined
                }
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

            {displayMessages.map((msg) => {
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
                      assistantName={assistantName}
                      kind={msg.kind}
                      toolCalls={msg.toolCalls}
                      timestamp={msg.timestamp}
                      onSuggestionReply={handleSuggestionReply}
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
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={handleAttachmentSelection}
        />

        <ChatComposer
          input={input}
          attachments={attachments}
          onInputChange={setInput}
          onAddAttachments={handleAddAttachments}
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
          contextUsage={showContextUsage ? contextUsage : undefined}
          showQualityIndicator={showQualityIndicator}
          attendantTestActive={
            showAttendantTestButton && testingPublicAttendant
          }
          onToggleAttendantTest={
            showAttendantTestButton
              ? () => {
                  setTestingPublicAttendant((prev) => !prev)
                }
              : undefined
          }
        />
      </div>
      {showPendingHandoffsSidebar ? (
        <PendingHandoffsSidebar className="hidden xl:flex" />
      ) : null}
    </div>
  )
}
