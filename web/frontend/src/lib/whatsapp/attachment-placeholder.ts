import type { AttachmentKind } from "@/components/agent/whatsapp/chat/attachment-menu"

/**
 * Until the backend grows multipart support, attachments dropped or picked in
 * the dashboard get a textual placeholder so the conversation timeline still
 * reflects the operator's intent. The string is also legible if the contact
 * receives it (it is, however, NOT how WhatsApp natively renders media — when
 * the backend adds binary support, this layer becomes a no-op).
 */
export function attachmentPlaceholder(
  kind: AttachmentKind,
  files: File[],
): string {
  const names = files.map((f) => f.name).filter(Boolean)
  const label = LABEL[kind]
  if (names.length === 0) return `[${label}]`
  if (names.length === 1) return `[${label}: ${names[0]}]`
  return `[${label}s: ${names.join(", ")}]`
}

const LABEL: Record<AttachmentKind, string> = {
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
  camera: "Foto da câmera",
  contact: "Contato",
  location: "Localização",
}

export function audioPlaceholder(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const ts = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `[Áudio: ${ts}]`
}
