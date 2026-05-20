import { IconLoader2, IconNotes, IconSend } from "@tabler/icons-react"
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
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

import { type AttachmentKind, AttachmentMenu } from "./attachment-menu"
import { AudioRecorder } from "./audio-recorder"
import { EmojiPicker } from "./emoji-picker"
import { QuickRepliesPopover } from "./quick-replies-popover"
import { ReplyPreview, type ReplyTarget } from "./reply-preview"

export interface MessageInputHandle {
  focus: () => void
}

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
  /** Saves an internal note for this chat instead of sending. */
  onSaveNote?: (body: string) => void
  /** Contact display name, used by the quick-reply renderer. */
  contactName?: string
  /** Imperative ref exposing `focus()` (used by global shortcuts). */
  inputRef?: React.Ref<MessageInputHandle>
  placeholder?: string
  disabled?: boolean
}

/**
 * Full WhatsApp-Web–style composer:
 *  - reply banner (when `replyTarget`)
 *  - internal note toggle (yellow style; bypasses the gateway)
 *  - quick replies via "/" (popover with arrow-key navigation)
 *  - emoji picker (and `:` shortcut)
 *  - attachment menu (paperclip → image / video / doc / camera / contact / location)
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
  onSaveNote,
  contactName,
  inputRef,
  placeholder = "Escreva uma mensagem… (Ctrl+Enter para enviar)",
  disabled = false,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [noteMode, setNoteMode] = useState(false)
  const recorder = useAudioRecorder()

  // Quick replies popover: opens when the operator types "/something" at
  // the very start of the composer. Closes once they delete the slash or
  // press Esc.
  const slashQuery = value.startsWith("/") ? value.slice(1) : null
  const slashOpen = slashQuery !== null && !noteMode

  useImperativeHandle(
    inputRef,
    () => ({
      focus() {
        textareaRef.current?.focus()
      },
    }),
    [],
  )

  const notifyTyping = useCallback(() => {
    onTyping?.()
  }, [onTyping])

  const submit = useCallback(
    (rawContent: string) => {
      const body = rawContent.trim()
      if (!body) return
      if (noteMode) {
        onSaveNote?.(body)
        onChange("")
        return
      }
      const content = replyTarget
        ? buildQuotedMessage({
            reply: { preview: replyTarget.preview },
            body,
          })
        : body
      onSend(content)
    },
    [noteMode, onChange, onSaveNote, onSend, replyTarget],
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
      // Quick-replies popover handles Enter/Tab/Arrow keys via capture-phase.
      if (slashOpen) return
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
      if (e.key === ":" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.currentTarget
        const pos = el.selectionStart ?? 0
        const prevChar = pos === 0 ? "" : (value[pos - 1] ?? "")
        if (prevChar === "" || /\s/.test(prevChar)) {
          e.preventDefault()
          setEmojiOpen(true)
        }
      }
    },
    [onCancelReply, replyTarget, slashOpen, submit, value],
  )

  useEffect(() => {
    if (!sending && value === "") textareaRef.current?.focus()
  }, [sending, value])

  const isRecording =
    recorder.state === "recording" || recorder.state === "requesting"

  function handleFilesPicked(kind: AttachmentKind, files: File[]) {
    submit(attachmentPlaceholder(kind, files))
  }

  return (
    <div
      className={`border-border/40 bg-background border-t ${
        noteMode ? "ring-2 ring-amber-400/40 ring-inset" : ""
      }`}
    >
      {replyTarget && onCancelReply && (
        <ReplyPreview target={replyTarget} onCancel={onCancelReply} />
      )}
      {noteMode && (
        <div className="border-border/40 flex items-center gap-2 border-b bg-amber-50 px-3 py-1.5 dark:bg-amber-950/30">
          <IconNotes
            className="size-3.5 text-amber-700 dark:text-amber-300"
            aria-hidden="true"
          />
          <p className="flex-1 text-xs text-amber-700 dark:text-amber-300">
            Nota interna · visível apenas para operadores neste dashboard
          </p>
          <button
            type="button"
            onClick={() => setNoteMode(false)}
            className="text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
          >
            Desligar
          </button>
        </div>
      )}
      <form
        className="flex items-end gap-1.5 px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
        aria-label={noteMode ? "Adicionar nota interna" : "Enviar mensagem"}
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
              disabled={sending || disabled || noteMode}
            />
            {onSaveNote && (
              <Button
                type="button"
                variant={noteMode ? "default" : "ghost"}
                size="icon"
                className={`size-9 shrink-0 ${
                  noteMode ? "bg-amber-500 text-white hover:bg-amber-600" : ""
                }`}
                onClick={() => setNoteMode((v) => !v)}
                aria-pressed={noteMode}
                aria-label={
                  noteMode ? "Voltar para mensagem normal" : "Nota interna"
                }
                title="Nota interna"
              >
                <IconNotes className="size-4" aria-hidden="true" />
              </Button>
            )}
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
            <QuickRepliesPopover
              open={slashOpen && !noteMode}
              onOpenChange={(o) => {
                if (!o && slashOpen) onChange("")
              }}
              query={slashQuery ?? ""}
              contactName={contactName}
              onPick={(rendered) => {
                onChange(rendered)
                queueMicrotask(() => {
                  textareaRef.current?.focus()
                  const len = rendered.length
                  textareaRef.current?.setSelectionRange(len, len)
                })
              }}
              anchor={
                <Textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    noteMode ? "Escreva uma nota interna…" : placeholder
                  }
                  disabled={sending || disabled}
                  rows={1}
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-xl text-sm"
                  aria-label={
                    noteMode ? "Conteúdo da nota interna" : "Mensagem a enviar"
                  }
                />
              }
            />
            {value.trim().length === 0 && !noteMode ? (
              <AudioRecorder
                recorder={recorder}
                onStart={() => void recorder.start()}
                onSend={(clip) => submit(audioPlaceholder(clip.durationMs))}
              />
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={sending || disabled || value.trim().length === 0}
                className={`h-10 w-10 shrink-0 rounded-xl ${
                  noteMode
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-wa-brand hover:bg-wa-brand-hover text-white"
                }`}
                aria-label={
                  sending
                    ? "Enviando"
                    : noteMode
                      ? "Salvar nota"
                      : "Enviar mensagem"
                }
              >
                {sending ? (
                  <IconLoader2
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
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
