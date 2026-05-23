import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileText,
  IconTerminal2,
} from "@tabler/icons-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

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

  return truncateStatusText(summary || "tarefa")
}

function CompactAssistantStatus({
  kind,
  toolCalls,
}: {
  kind: AssistantMessageKind
  toolCalls: ChatToolCall[]
}) {
  const { t } = useTranslation()
  const isToolCalls = kind === "tool_calls"
  const firstToolCall = toolCalls[0]
  const status = isToolCalls
    ? t("chat.executingStatus", {
        action: firstToolCall ? summarizeToolCall(firstToolCall) : "tarefa",
      })
    : t("chat.thinkingStatus")

  return (
    <div className="text-muted-foreground/75 flex flex-col gap-3 rounded-lg px-1 py-1 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {isToolCalls ? (
          <IconTerminal2 className="size-4 shrink-0 opacity-80" />
        ) : null}
        <span className="truncate">{status}</span>
      </div>
      {!isToolCalls ? null : (
        <div className="text-muted-foreground/70">
          {t("chat.thinkingStatus")}
        </div>
      )}
    </div>
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
}: AssistantMessageProps) {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const isThought = kind === "thought"
  const isToolCalls = kind === "tool_calls"
  const isCollapsedBlock = isThought || isToolCalls
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
    kind === "normal" ? parseChatSuggestionCard(displayContent) : null

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
    <div className="group flex w-full flex-col gap-1.5">
      {!isCollapsedBlock && messageMeta.length > 0 && (
        <div className="text-muted-foreground/60 flex items-center justify-between gap-2 px-1 text-xs opacity-70">
          <div className="flex items-center gap-2">
            <span>{messageMeta.join(" • ")}</span>
          </div>
        </div>
      )}

      {(hasText || isCollapsedBlock || hasToolCalls) && (
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border",
            isCollapsedBlock
              ? "border-transparent bg-transparent"
              : "bg-card text-card-foreground border-border/60",
          )}
        >
          {isCollapsedBlock && (
            <CompactAssistantStatus kind={kind} toolCalls={toolCalls} />
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
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                  >
                    {displayContent}
                  </ReactMarkdown>
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
        </div>
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
        <div className="mt-1 flex flex-wrap gap-3">
          {fileAttachments.map((attachment, index) => (
            <a
              key={`${attachment.url}-${index}`}
              href={attachment.url}
              download={attachment.filename}
              className="group/file border-border/60 bg-card flex w-fit max-w-sm min-w-[220px] items-center gap-3.5 rounded-xl border px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-500/30 hover:shadow-sm dark:hover:border-violet-500/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-violet-400 ring-1 ring-violet-500/10 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30">
                <IconFileText className="h-5 w-5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col pr-1">
                <span className="text-foreground/90 truncate text-[14px] leading-tight font-medium transition-colors group-hover/file:text-violet-600 dark:group-hover/file:text-violet-400">
                  {attachment.filename || "Download file"}
                </span>
                <span className="text-muted-foreground/70 mt-1 text-[12px] font-medium">
                  {attachment.filename?.split(".").pop()?.toUpperCase() ||
                    "FILE"}
                </span>
              </div>
              <div className="bg-muted/60 text-muted-foreground/50 dark:bg-muted/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 group-hover/file:bg-violet-400 group-hover/file:text-white group-hover/file:shadow-sm dark:group-hover/file:bg-violet-400">
                <IconDownload className="h-4 w-4 transition-transform duration-300 group-hover/file:-translate-y-[1px]" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
