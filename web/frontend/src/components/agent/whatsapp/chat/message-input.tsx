import { IconLoader2, IconSend } from "@tabler/icons-react"
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAudioRecorder } from "@/hooks/whatsapp/use-audio-recorder"
import {
  attachmentPlaceholder,
  audioPlaceholder,
} from "@/lib/whatsapp/attachment-placeholder"
import { buildQuotedMessage } from "@/lib/whatsapp/quote"

import {
  type AttachmentKind,
  AttachmentMenu,
} from "./attachment-menu"
import { AudioRecorder } from "./audio-recorder"
import { EmojiPicker } from "./emoji-picker"
import { ReplyPreview, type ReplyTarget } from "./reply-preview"

export interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  /** Called with the final outgoing content (already wrapped in quote prefix). */
  onSend: (content: string) => void
  sending: boolean
  /** Called whenever the operator types — drives the auto-pause hook at the page level. */
  onTyping?: () => void
  /** Reply target — when set, ReplyPreview is rendered above the textarea. */
  replyTarget?: ReplyTarget | null
  onCancelReply?: () => void
  placeholder?: string
  disabled?: boolean
}

/**
 * Full WhatsApp-Web–style composer:
 *  - reply banner (when `replyTarget`)
 *  - attachment menu (paperclip → image / video / doc / camera / contact / location)
 *  - emoji picker (and `:` shortcut)
 *  - audio recorder (microphone → live waveform + send)
 *  - autopause hook + Ctrl/⌘+Enter to send
 *
 * Until the backend grows multipart support, attachments and audio collapse
 * into textual placeholders via `attachmentPlaceholder()` / `audioPlaceholder()`.
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  sending,
  onTyping,
  replyTarget,
  onCancelReply,
  placeholder = "Escreva uma mensagem… (Ctrl+Enter para enviar)",
  disabled = false,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const recorder = useAudioRecorder()

  const notifyTyping = useCallback(() => {
    onTyping?.()
  }, [onTyping])

  const submit = useCallback(
    (rawContent: string) => {
      const body = rawContent.trim()
      if (!body) return
      const content = replyTarget
        ? buildQuotedMessage({
            reply: { preview: replyTarget.preview },
            body,
          })
        : body
      onSend(content)
    },
    [onSend, replyTarget],
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      if (e.target.value.trim().length > 0) notifyTyping()
    },
    [notifyTyping, onChange],
  )

  const insertAtCursor = useCallback(
    (insertion: string) => {
      const el = textareaRef.current
      if (!el) {
        onChange(value + insertion)
        return
      }
      const start = el.selectionStart ?? value.length
      const end = el.selectionEnd ?? value.length
      const next = value.slice(0, start) + insertion + value.slice(end)
      onChange(next)
      // Restore caret AFTER the inserted text on the next paint.
      queueMicrotask(() => {
        el.focus()
        const caret = start + insertion.length
        el.setSelectionRange(caret, caret)
      })
      notifyTyping()
    },
    [notifyTyping, onChange, value],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        submit(value)
        return
      }
      if (e.key === "Escape" && replyTarget) {
        e.preventDefault()
        onCancelReply?.()
        return
      }
      // Bare ":" with no other modifier opens the emoji picker, mirroring
      // Slack/Discord. Only triggers when caret is at start or after space
      // so it doesn't disrupt URLs like `https://`.
      if (e.key === ":" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.currentTarget
        const pos = el.selectionStart ?? 0
        const prevChar = pos === 0 ? "" : value[pos - 1] ?? ""
        if (prevChar === "" || /\s/.test(prevChar)) {
          e.preventDefault()
          setEmojiOpen(true)
        }
      }
    },
    [onCancelReply, replyTarget, submit, value],
  )

  useEffect(() => {
    if (!sending && value === "") textareaRef.current?.focus()
  }, [sending, value])

  const isRecording = recorder.state === "recording" || recorder.state === "requesting"

  function handleFilesPicked(kind: AttachmentKind, files: File[]) {
    const placeholder = attachmentPlaceholder(kind, files)
    submit(placeholder)
  }

  return (
    <div className="border-border/40 bg-background border-t">
      {replyTarget && onCancelReply && (
        <ReplyPreview target={replyTarget} onCancel={onCancelReply} />
      )}
      <form
        className="flex items-end gap-1.5 px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
        aria-label="Formulário de envio de mensagem"
      >
        {!isRecording && (
          <>
            <EmojiPicker
              open={emojiOpen}
              onOpenChange={setEmojiOpen}
              onPick={(emoji) => insertAtCursor(emoji)}
            />
            <AttachmentMenu
              onPickFiles={handleFilesPicked}
              disabled={sending || disabled}
            />
          </>
        )}

        {isRecording ? (
          <AudioRecorder
            recorder={recorder}
            onStart={() => void recorder.start()}
            onSend={(clip) => submit(audioPlaceholder(clip.durationMs))}
          />
        ) : (
          <>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={sending || disabled}
              rows={1}
              className="min-h-10 max-h-32 flex-1 resize-none rounded-xl text-sm"
              aria-label="Mensagem a enviar"
            />
            {value.trim().length === 0 ? (
              <AudioRecorder
                recorder={recorder}
                onStart={() => void recorder.start()}
                onSend={(clip) => submit(audioPlaceholder(clip.durationMs))}
              />
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={sending || disabled}
                className="h-10 w-10 shrink-0 rounded-xl bg-[#25d366] text-white hover:bg-[#1da851]"
                aria-label={sending ? "Enviando" : "Enviar mensagem"}
              >
                {sending ? (
                  <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <IconSend className="size-4" aria-hidden="true" />
                )}
              </Button>
            )}
          </>
        )}
      </form>
    </div>
  )
}
