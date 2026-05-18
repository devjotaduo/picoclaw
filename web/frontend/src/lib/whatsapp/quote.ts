/**
 * Reply/quote support. WhatsApp uses `>` blockquote markdown in plaintext, so
 * we encode replies the same way when sending — the contact's WhatsApp client
 * renders it as a quote natively and the dashboard renders it richly via
 * `parseQuotedContent`.
 *
 * Format: `> ${preview line 1}\n> ${preview line 2}\n\n${actual reply body}`
 *
 * The preview is truncated to MAX_PREVIEW_LEN to keep the encoded message
 * compact (long quotes get a `…` ellipsis).
 */
const MAX_PREVIEW_LEN = 160

export interface QuoteData {
  preview: string
  /** Whatever the operator typed AFTER the quote. */
  body: string
}

export interface BuildQuotedMessageInput {
  reply: { preview: string }
  body: string
}

export function buildQuotedMessage({
  reply,
  body,
}: BuildQuotedMessageInput): string {
  const trimmedPreview = truncatePreview(reply.preview)
  const quoted = trimmedPreview
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
  return `${quoted}\n\n${body}`
}

export function parseQuotedContent(text: string): QuoteData | null {
  if (!text.startsWith(">")) return null
  const lines = text.split(/\r?\n/)
  const quoteLines: string[] = []
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith("> ")) {
      quoteLines.push(line.slice(2))
    } else if (line.startsWith(">")) {
      quoteLines.push(line.slice(1))
    } else {
      break
    }
  }
  if (quoteLines.length === 0) return null
  // Skip the single blank separator between quote and body.
  if (i < lines.length && lines[i] === "") i++
  const body = lines.slice(i).join("\n")
  return {
    preview: quoteLines.join("\n").trim(),
    body: body.trim(),
  }
}

export function truncatePreview(text: string, max = MAX_PREVIEW_LEN): string {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, max - 1).trimEnd()}…`
}
