import { IconCornerDownLeft, IconX } from "@tabler/icons-react"

import { truncatePreview } from "@/lib/whatsapp/quote"

export interface ReplyTarget {
  /** Original message id being replied to. */
  id: number
  /** Plain-text preview of the original message. */
  preview: string
  /** Whether the original was outbound (from us) — affects the accent color. */
  isOut: boolean
  /** Short author label rendered above the preview. */
  authorLabel: string
}

export interface ReplyPreviewProps {
  target: ReplyTarget
  onCancel: () => void
  className?: string
}

/**
 * Compact preview banner rendered above the composer when the operator clicks
 * "Responder" on a message. Mirrors the WhatsApp Web look: thin accent bar +
 * author + truncated quote + close button.
 */
export function ReplyPreview({
  target,
  onCancel,
  className = "",
}: ReplyPreviewProps) {
  const accent = target.isOut
    ? "border-sky-400 text-sky-700 dark:text-sky-300"
    : "border-emerald-500 text-emerald-700 dark:text-emerald-300"
  return (
    <div
      className={`bg-muted/40 border-border/40 flex items-start gap-2 border-b px-3 py-2 ${className}`}
      role="region"
      aria-label="Mensagem sendo respondida"
    >
      <IconCornerDownLeft
        className="text-foreground/50 mt-0.5 size-3.5 shrink-0"
        aria-hidden="true"
      />
      <div className={`min-w-0 flex-1 border-l-2 pl-2 ${accent}`}>
        <p className="truncate text-[11px] font-semibold">
          {target.authorLabel}
        </p>
        <p className="text-foreground/75 truncate text-xs">
          {truncatePreview(target.preview, 120)}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-foreground/55 hover:text-foreground focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Cancelar resposta"
      >
        <IconX className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
