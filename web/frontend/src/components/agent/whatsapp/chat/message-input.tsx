import { IconLoader2, IconSend } from "@tabler/icons-react"
import { useCallback, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAgentAutoPause } from "@/hooks/whatsapp/use-agent-auto-pause"

export interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  /** Whether the agent is currently paused on the server. */
  paused: boolean
  /** Called when the auto-pause hook decides to flip the server state. */
  onPauseRequest: (paused: boolean) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * Composer with WhatsApp-Web–style behavior:
 *  - Ctrl/⌘+Enter sends
 *  - typing → debounce 800ms → request pause
 *  - 5 min of typing-silence → request resume
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  sending,
  paused,
  onPauseRequest,
  placeholder = "Escreva uma mensagem… (Ctrl+Enter para enviar)",
  disabled = false,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handlePauseChange = useCallback(
    (next: boolean) => onPauseRequest(next),
    [onPauseRequest],
  )
  const { notifyTyping } = useAgentAutoPause({
    paused,
    onChange: handlePauseChange,
    enabled: !disabled,
  })

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      if (e.target.value.trim().length > 0) notifyTyping()
    },
    [notifyTyping, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (value.trim()) onSend()
      }
    },
    [onSend, value],
  )

  useEffect(() => {
    // Refocus after a successful send (value cleared by parent).
    if (!sending && value === "") textareaRef.current?.focus()
  }, [sending, value])

  return (
    <form
      className="flex items-end gap-2 px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSend()
      }}
      aria-label="Formulário de envio de mensagem"
    >
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
      <Button
        type="submit"
        size="icon"
        disabled={!value.trim() || sending || disabled}
        className="h-10 w-10 shrink-0 rounded-xl bg-[#25d366] text-white hover:bg-[#1da851]"
        aria-label={sending ? "Enviando" : "Enviar mensagem"}
      >
        {sending ? (
          <IconLoader2 className="size-4 animate-spin" />
        ) : (
          <IconSend className="size-4" />
        )}
      </Button>
    </form>
  )
}
