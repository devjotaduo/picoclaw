import { IconFileText } from "@tabler/icons-react"

import { Message, MessageContent } from "@/components/ai-elements/message"
import { cn } from "@/lib/utils"
import type { ChatAttachment } from "@/store/chat"

interface UserMessageProps {
  content: string
  attachments?: ChatAttachment[]
}

export function UserMessage({ content, attachments = [] }: UserMessageProps) {
  const hasText = content.trim().length > 0
  const isCommand = content.trim().startsWith("/")
  const imageAttachments = attachments.filter(
    (attachment) => attachment.type === "image",
  )
  const audioAttachments = attachments.filter(
    (attachment) => attachment.type === "audio",
  )
  const fileAttachments = attachments.filter(
    (attachment) => attachment.type !== "image" && attachment.type !== "audio",
  )

  const formatAttachmentType = (attachment: ChatAttachment) => {
    const contentType = attachment.contentType?.split(";")[0]?.trim()
    if (contentType) {
      return contentType
    }
    return attachment.filename?.split(".").pop()?.toUpperCase() || "Arquivo"
  }

  return (
    <Message from="user" className="max-w-full gap-1.5">
      {imageAttachments.length > 0 && (
        <div className="flex max-w-[70%] flex-wrap justify-end gap-2">
          {imageAttachments.map((attachment, index) => (
            <img
              key={`${attachment.url}-${index}`}
              src={attachment.url}
              alt={attachment.filename || "Uploaded image"}
              className="max-h-72 max-w-full object-cover"
            />
          ))}
        </div>
      )}

      {audioAttachments.length > 0 && (
        <div className="flex max-w-[70%] flex-col items-end gap-2">
          {audioAttachments.map((attachment, index) => (
            <audio
              key={`${attachment.url}-${index}`}
              controls
              src={attachment.url}
              className="max-w-full"
            />
          ))}
        </div>
      )}

      {fileAttachments.length > 0 && (
        <div className="flex max-w-[70%] flex-col items-end gap-2">
          {fileAttachments.map((attachment, index) => (
            <div
              key={`${attachment.url}-${index}`}
              className="bg-card text-card-foreground border-border/70 flex max-w-full items-center gap-3 rounded-xl border px-3 py-2 shadow-sm"
            >
              <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                <IconFileText className="size-4" />
              </div>
              <div className="min-w-0 text-left">
                <div className="truncate text-sm font-medium">
                  {attachment.filename || "Documento enviado"}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {formatAttachmentType(attachment)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasText && (
        <MessageContent
          className={cn(
            "max-w-[70%] wrap-break-word whitespace-pre-wrap",
            isCommand
              ? "rounded-xl border border-zinc-200 bg-transparent px-4 py-3 font-mono text-[14px] text-zinc-800 dark:border-zinc-800/60 dark:bg-[#121212] dark:text-zinc-200 dark:shadow-sm"
              : "rounded-2xl rounded-tr-sm bg-violet-500 px-5 py-3 text-[15px] leading-relaxed text-white shadow-sm",
          )}
        >
          {isCommand ? (
            <div className="flex items-start gap-2.5">
              <span className="font-bold text-emerald-700 select-none dark:text-emerald-300">
                ❯
              </span>
              <span className="mt-[1px]">{content}</span>
            </div>
          ) : (
            content
          )}
        </MessageContent>
      )}
    </Message>
  )
}
