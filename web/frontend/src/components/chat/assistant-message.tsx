import {
  IconCheck,
  IconCopy,
  IconFileText,
  IconLoader2,
  IconTerminal2,
} from "@tabler/icons-react"
import { useState } from "react"

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import { SuggestionChoiceCard } from "@/components/chat/suggestion-choice-card"
import { Button } from "@/components/ui/button"
import { formatMessageTime } from "@/hooks/use-pico-chat"
import { parseChatSuggestionCard } from "@/lib/chat-suggestion-card"
import { cn } from "@/lib/utils"
import {
  type AssistantMessageKind,
  type ChatAttachment,
  type ChatToolCall,
} from "@/store/chat"

interface AssistantMessageProps {
  content: string
  attachments?: ChatAttachment[]
  assistantName?: string
  kind?: AssistantMessageKind
  toolCalls?: ChatToolCall[]
  timestamp?: string | number
  onSuggestionReply?: (content: string) => void
  showAssistantDetailContent?: boolean
  allowSuggestionCard?: boolean
}

function localizeContextCommandContent(content: string): string {
  if (!content.includes("Context usage")) {
    return content
  }

  return content
    .replace(/^Context usage/gm, "Uso do contexto")
    .replace(/^Messages:/gm, "Mensagens:")
    .replace(/^Used:/gm, "Usado:")
    .replace(/^Compress at:/gm, "Limite de compressão:")
    .replace(/^Compression progress:/gm, "Progresso da compressão:")
    .replace(/^Remaining:/gm, "Restante:")
}

function truncateStatusText(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

const LOCAL_PATH_LABEL = "caminho local"
const ABSOLUTE_PATH_PREFIX = String.raw`(?:[A-Za-z]:[\\/]|/(?:Users|home|var|tmp|mnt|opt|usr|workspace|app|srv|etc)/)`
const QUOTED_ABSOLUTE_PATH_RE = new RegExp(
  `(["'\`])${ABSOLUTE_PATH_PREFIX}[^"'\`<>|]+\\1`,
  "g",
)
const UNQUOTED_WINDOWS_PATH_RE =
  /(^|[\s([{=,:])([A-Za-z]:[\\/][^\s"'`<>|)\]}]+)/g
const UNQUOTED_UNIX_PATH_RE =
  /(^|[\s([{=,:])(\/(?:Users|home|var|tmp|mnt|opt|usr|workspace|app|srv|etc)\/[^\s"'`<>|)\]}]+)/g

function redactAbsolutePaths(value: string): string {
  return value
    .replace(QUOTED_ABSOLUTE_PATH_RE, `$1${LOCAL_PATH_LABEL}$1`)
    .replace(UNQUOTED_WINDOWS_PATH_RE, `$1${LOCAL_PATH_LABEL}`)
    .replace(UNQUOTED_UNIX_PATH_RE, `$1${LOCAL_PATH_LABEL}`)
}

function cleanToolStatusText(value: string): string {
  const sanitized = redactAbsolutePaths(value).replace(/\s+/g, " ").trim()
  return sanitized === LOCAL_PATH_LABEL ? "ferramenta local" : sanitized
}

function parseToolArguments(
  rawArguments: string,
): Record<string, unknown> | null {
  const trimmed = rawArguments.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

function firstStringValue(
  values: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!values) {
    return ""
  }

  for (const key of keys) {
    const value = values[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return ""
}

function friendlyToolName(toolName: string): string {
  return toolName
    .replace(/^functions\./, "")
    .replace(/^mcp__[^_]+__/, "")
    .replace(/[_-]+/g, " ")
    .trim()
}

function summarizeToolCall(toolCall: ChatToolCall): string {
  const toolName = toolCall.function?.name?.trim() ?? ""
  const rawArguments = toolCall.function?.arguments?.trim() ?? ""
  const parsedArguments = parseToolArguments(rawArguments)
  const command = firstStringValue(parsedArguments, [
    "command",
    "cmd",
    "script",
    "query",
    "q",
    "url",
    "path",
  ])
  const summary = command || friendlyToolName(toolName) || rawArguments

  return truncateStatusText(cleanToolStatusText(summary || "tarefa"))
}

function toolInput(toolCall: ChatToolCall): unknown {
  const rawArguments = toolCall.function?.arguments?.trim() ?? ""
  return parseToolArguments(rawArguments) ?? rawArguments
}

function toolOutput(toolCall: ChatToolCall): string {
  return toolCall.extraContent?.toolFeedbackExplanation?.trim() ?? ""
}

function toolDisplayType(name: string): `tool-${string}` {
  const normalized = name.trim() || "task"
  return normalized.startsWith("tool-")
    ? (normalized as `tool-${string}`)
    : `tool-${normalized}`
}

function AssistantReasoningStatus({
  content,
  showContent,
  label = "Pensando",
  compact = false,
}: {
  content: string
  showContent: boolean
  label?: string
  compact?: boolean
}) {
  const hasContent = showContent && content.trim().length > 0

  if (compact && !hasContent) {
    return (
      <Reasoning
        className="mb-1 rounded-md px-1 py-0"
        defaultOpen={false}
        isStreaming
      >
        <ReasoningTrigger
          aria-label={label}
          className="text-muted-foreground/75 hover:text-muted-foreground/75 pointer-events-none w-fit cursor-default gap-2 px-0 py-0 text-[13px]"
        >
          <span className="border-border/60 bg-muted/20 text-muted-foreground/70 grid size-4 shrink-0 place-items-center rounded-sm border">
            <IconTerminal2 className="size-3" />
          </span>
          <Shimmer as="span" duration={1.1}>
            {label}
          </Shimmer>
        </ReasoningTrigger>
      </Reasoning>
    )
  }

  return (
    <Reasoning isStreaming={!hasContent} defaultOpen={hasContent}>
      <ReasoningTrigger
        getThinkingMessage={(isStreaming, duration) =>
          isStreaming ? (
            <Shimmer duration={1}>{label}</Shimmer>
          ) : duration ? (
            `${label} por ${duration}s`
          ) : (
            label
          )
        }
      />
      {hasContent ? <ReasoningContent>{content}</ReasoningContent> : null}
    </Reasoning>
  )
}

function AssistantToolStatus({
  toolCalls,
  showContent,
}: {
  toolCalls: ChatToolCall[]
  showContent: boolean
}) {
  const visibleToolCalls = toolCalls.length > 0 ? toolCalls : [{}]
  const activeLabel =
    toolCalls.length > 0 ? summarizeToolCall(toolCalls[0]) : "tarefa"

  if (!showContent) {
    return (
      <div className="not-prose border-border/55 bg-card/70 relative flex w-fit max-w-[min(42rem,100%)] items-center gap-2 overflow-hidden rounded-full border px-3 py-1.5 text-[13px] shadow-sm shadow-black/10 backdrop-blur-sm">
        <span className="grid size-5 shrink-0 place-items-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-400">
          <IconLoader2 className="size-3.5 animate-spin" />
        </span>
        <span className="text-foreground/85 font-medium">Executando</span>
        <span className="text-muted-foreground max-w-[30rem] truncate">
          {activeLabel}
        </span>
        <span className="absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/35 to-transparent" />
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {visibleToolCalls.map((toolCall, index) => {
        const name = toolCall.function?.name || toolCall.type || "Ferramenta"
        const output = toolOutput(toolCall)
        const input = toolInput(toolCall)
        const state = output ? "output-available" : "input-available"
        const type = toolDisplayType(name)

        return (
          <Tool
            key={toolCall.id || `${name}-${index}`}
            className="border-border/55 bg-card/70 mb-2 overflow-hidden rounded-lg shadow-sm shadow-black/10"
            defaultOpen={showContent && !output}
          >
            <ToolHeader
              className="hover:bg-muted/25 min-h-11 px-3 py-2.5 [&_span]:truncate [&>div:first-child]:min-w-0"
              title={
                showContent ? summarizeToolCall(toolCall) : "Executando tarefa"
              }
              state={state}
              type={type}
            />
            {showContent ? (
              <ToolContent className="border-border/35 bg-background/35 border-t p-3">
                <ToolInput input={input || {}} />
                <ToolOutput
                  output={
                    output ? <MessageResponse>{output}</MessageResponse> : null
                  }
                  errorText={undefined}
                />
              </ToolContent>
            ) : null}
          </Tool>
        )
      })}
    </div>
  )
}

interface AssistantSource {
  href: string
  title: string
}

function extractLinks(content: string): AssistantSource[] {
  const sources = new Map<string, AssistantSource>()
  const markdownLinkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  const plainLinkRe = /https?:\/\/[^\s)]+/g

  for (const match of content.matchAll(markdownLinkRe)) {
    const title = cleanSourceTitle(match[1] || match[2] || "")
    const href = cleanSourceHref(match[2] || "")
    if (href) {
      sources.set(href, { href, title: title || href })
    }
  }

  for (const match of content.matchAll(plainLinkRe)) {
    const href = cleanSourceHref(match[0] || "")
    if (href && !sources.has(href)) {
      sources.set(href, { href, title: href })
    }
  }

  return [...sources.values()]
}

function cleanSourceHref(value: string): string {
  return value.replace(/[.,;:!?]+$/, "").trim()
}

function cleanSourceTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function attachmentSources(attachments: ChatAttachment[]): AssistantSource[] {
  return attachments.map((attachment) => ({
    href: attachment.url,
    title: attachment.filename || attachment.url,
  }))
}

function AssistantSources({ sources }: { sources: AssistantSource[] }) {
  if (sources.length === 0) {
    return null
  }

  return (
    <Sources className="mt-1 max-w-xl">
      <SourcesTrigger count={sources.length} />
      <SourcesContent>
        {sources.map((source) => (
          <Source key={source.href} href={source.href} title={source.title}>
            {source.title}
          </Source>
        ))}
      </SourcesContent>
    </Sources>
  )
}

export function AssistantMessage({
  content,
  attachments = [],
  assistantName = "",
  kind = "normal",
  toolCalls = [],
  timestamp = "",
  onSuggestionReply,
  showAssistantDetailContent = true,
  allowSuggestionCard = true,
}: AssistantMessageProps) {
  const [isCopied, setIsCopied] = useState(false)
  const isThought = kind === "thought"
  const isToolCalls = kind === "tool_calls"
  const isCollapsedBlock = isThought || isToolCalls
  const isCompactToolCall = isToolCalls && !showAssistantDetailContent
  const displayContent = localizeContextCommandContent(content)
  const hasText = displayContent.trim().length > 0
  const hasToolCalls = toolCalls.length > 0
  const imageAttachments = attachments.filter(
    (attachment) => attachment.type === "image",
  )
  const audioAttachments = attachments.filter(
    (attachment) => attachment.type === "audio",
  )
  const fileAttachments = attachments.filter(
    (attachment) => attachment.type !== "image" && attachment.type !== "audio",
  )
  const formattedTimestamp =
    timestamp !== "" ? formatMessageTime(timestamp) : ""
  const messageMeta = [assistantName.trim(), formattedTimestamp].filter(Boolean)
  const suggestionCard =
    kind === "normal" && allowSuggestionCard
      ? parseChatSuggestionCard(displayContent)
      : null
  const sources = [
    ...extractLinks(displayContent),
    ...attachmentSources(fileAttachments),
  ]

  const handleCopy = async () => {
    const markCopied = () => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(displayContent)
        markCopied()
        return
      }
    } catch {
      // HTTP 或受限环境下可能不支持 Clipboard API，继续走降级方案
    }

    const textArea = document.createElement("textarea")
    textArea.value = displayContent
    textArea.setAttribute("readonly", "")
    textArea.style.position = "fixed"
    textArea.style.left = "-9999px"
    document.body.appendChild(textArea)
    textArea.select()

    try {
      const copied = document.execCommand("copy")
      if (copied) {
        markCopied()
      }
    } finally {
      document.body.removeChild(textArea)
    }
  }

  return (
    <Message from="assistant" className="max-w-full gap-1.5">
      {!isCollapsedBlock && messageMeta.length > 0 && (
        <div className="text-muted-foreground/60 flex items-center justify-between gap-2 px-1 text-xs opacity-70">
          <div className="flex items-center gap-2">
            <span>{messageMeta.join(" • ")}</span>
          </div>
        </div>
      )}

      {(hasText || isCollapsedBlock || hasToolCalls) && (
        <MessageContent
          className={cn(
            "relative overflow-hidden rounded-xl border",
            isCollapsedBlock
              ? "border-transparent bg-transparent group-[.is-assistant]:border-transparent group-[.is-assistant]:bg-transparent"
              : "bg-card text-card-foreground border-border/60",
            isCompactToolCall && "w-fit max-w-[min(42rem,100%)] rounded-full",
          )}
        >
          {isThought && (
            <AssistantReasoningStatus
              compact={!showAssistantDetailContent}
              content={displayContent}
              showContent={showAssistantDetailContent}
            />
          )}
          {isToolCalls && (
            <AssistantToolStatus
              toolCalls={toolCalls}
              showContent={showAssistantDetailContent}
            />
          )}
          {!isCollapsedBlock && !isToolCalls && hasText && (
            <>
              {suggestionCard ? (
                <SuggestionChoiceCard
                  card={suggestionCard}
                  disabled={!onSuggestionReply}
                  onSubmit={onSuggestionReply}
                />
              ) : (
                <div
                  className={cn(
                    "prose dark:prose-invert prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:border prose-pre:bg-zinc-100 prose-pre:p-0 prose-pre:text-zinc-900 dark:prose-pre:bg-zinc-950 dark:prose-pre:text-zinc-100 max-w-none [overflow-wrap:anywhere] break-words",
                    isThought
                      ? "prose-p:my-1.5 prose-p:whitespace-pre-wrap px-3 pt-0 pb-3 text-[13px] leading-relaxed opacity-70"
                      : "prose-p:my-2 prose-p:whitespace-pre-wrap p-4 text-[15px] leading-relaxed",
                  )}
                >
                  <MessageResponse>{displayContent}</MessageResponse>
                </div>
              )}
            </>
          )}

          {!isCollapsedBlock && hasText && !suggestionCard && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "bg-background/50 hover:bg-background/80 absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100",
              )}
              onClick={handleCopy}
            >
              {isCopied ? (
                <IconCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <IconCopy className="text-muted-foreground h-4 w-4" />
              )}
            </Button>
          )}
        </MessageContent>
      )}

      {imageAttachments.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {imageAttachments.map((attachment, index) => (
            <a
              key={`${attachment.url}-${index}`}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group/img border-border/50 bg-muted/30 hover:border-border/80 relative overflow-hidden rounded-xl border shadow-sm transition-colors"
            >
              <img
                src={attachment.url}
                alt={attachment.filename || "Attached image"}
                className="max-h-80 max-w-[280px] object-contain transition-transform duration-300 group-hover/img:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover/img:bg-black/10 dark:group-hover/img:bg-black/20" />
            </a>
          ))}
        </div>
      )}

      {audioAttachments.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          {audioAttachments.map((attachment, index) => (
            <audio
              key={`${attachment.url}-${index}`}
              controls
              src={attachment.url}
              className="max-w-[320px]"
            />
          ))}
        </div>
      )}

      {fileAttachments.length > 0 && (
        <div className="mt-1 flex max-w-xl flex-wrap gap-2">
          {fileAttachments.map((attachment, index) => (
            <a
              key={`${attachment.url}-${index}`}
              href={attachment.url}
              download={attachment.filename}
              className="border-border/60 bg-card hover:bg-muted/40 flex w-fit max-w-sm min-w-[220px] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors"
            >
              <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                <IconFileText className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {attachment.filename || "Documento"}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {attachment.filename?.split(".").pop()?.toUpperCase() ||
                    "ARQUIVO"}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
      {!isCollapsedBlock ? <AssistantSources sources={sources} /> : null}
    </Message>
  )
}
