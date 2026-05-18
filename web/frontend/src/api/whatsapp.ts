import { launcherFetch } from "@/api/http"

// Types mirror pkg/channels/whatsapp_native/inbox/store.go.
export interface WhatsAppChat {
  jid: string
  push_name?: string
  display_name?: string
  avatar_url?: string
  avatar_id?: string
  last_message_ts: number
  last_preview?: string
  last_direction?: string
  paused: boolean
  unread_count: number
  updated_at: number
  /**
   * Optional epoch (ms or seconds) of the contact's most recent typing event.
   * When `Date.now() - typing_at < 5s`, the dashboard renders a "digitando…"
   * indicator. Emitted by the gateway when a presence/composing event is
   * observed — until that lands server-side, this stays undefined and the
   * indicator is simply hidden.
   */
  typing_at?: number
}

// Delivery status for outbound messages. Matches the four-state model used by
// the WhatsApp Web UI. Backwards-compat: the backend currently only emits the
// boolean `delivered` field; `deriveMessageStatus()` in lib/message-status.ts
// computes the four-state value with sensible fallbacks. When the gateway
// starts emitting `status`/`read` events, the field gets populated server-side.
export type WhatsAppMessageStatus = "pending" | "sent" | "delivered" | "read"

export interface WhatsAppMessage {
  id: number
  message_id?: string
  chat_jid: string
  sender_jid?: string
  // direction: "in" (received from contact) | "out" (sent to contact)
  direction: "in" | "out"
  // source: "contact" (in) | "agent" | "human" (out)
  source: "contact" | "agent" | "human"
  content: string
  ts: number
  delivered: boolean
  // Optional richer status; if absent, derive from `delivered` + ts.
  status?: WhatsAppMessageStatus
  read_at?: number
  error?: string
}

export interface WhatsAppProductMention {
  product: string
  quantity?: string
  price_text?: string
  objection?: string
  ts?: number
}

export interface WhatsAppContactProfile {
  chat_jid: string
  phone?: string
  push_name?: string
  display_name?: string
  name?: string
  city?: string
  company?: string
  interest?: string
  preferences?: string
  summary?: string
  lead_stage: string
  lead_score: number
  priority: string
  intent?: string
  consent_status: string
  tags: string[]
  assigned_to?: string
  next_action?: string
  follow_up_at?: number
  follow_up_reason?: string
  created_at: number
  updated_at: number
}

export interface WhatsAppConversationInsight {
  chat_jid: string
  intent?: string
  priority: string
  lead_stage: string
  needs_handoff: boolean
  unanswered: boolean
  target_sector?: string
  summary?: string
  next_action?: string
  collected_fields: Record<string, string>
  missing_fields: string[]
  products: WhatsAppProductMention[]
  last_message_ts: number
  updated_at: number
}

export interface WhatsAppLabelCount {
  label: string
  count: number
}

export interface WhatsAppDailyMetric {
  date: string
  inbound: number
  outbound: number
  contacts: number
}

export interface WhatsAppReport {
  from: number
  to: number
  contacts: number
  new_contacts: number
  messages: number
  inbound_messages: number
  outbound_messages: number
  agent_replies: number
  human_replies: number
  paused_chats: number
  qualified_leads: number
  handoffs: number
  unanswered: number
  avg_first_response_seconds: number
  by_intent: WhatsAppLabelCount[]
  by_priority: WhatsAppLabelCount[]
  by_lead_stage: WhatsAppLabelCount[]
  top_products: WhatsAppLabelCount[]
  daily: WhatsAppDailyMetric[]
}

export interface InboxEvent {
  kind: "message" | "chat_update"
  chat?: WhatsAppChat
  message?: WhatsAppMessage
}

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await launcherFetch(path, init)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export interface WhatsAppAvatarResponse {
  url: string
  avatar_id: string
  cached: boolean
}

export async function fetchWhatsAppAvatar(
  jid: string,
  force = false,
): Promise<WhatsAppAvatarResponse> {
  return getJSON<WhatsAppAvatarResponse>(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/avatar`,
    { method: force ? "POST" : "GET" },
  )
}

export async function listWhatsAppChats(limit = 100): Promise<WhatsAppChat[]> {
  const data = await getJSON<{ chats: WhatsAppChat[] }>(
    `/api/whatsapp/chats?limit=${limit}`,
  )
  return data.chats ?? []
}

export async function listWhatsAppMessages(
  jid: string,
  limit = 100,
): Promise<WhatsAppMessage[]> {
  const data = await getJSON<{ messages: WhatsAppMessage[] }>(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/messages?limit=${limit}`,
  )
  return data.messages ?? []
}

export async function getWhatsAppContactProfile(
  jid: string,
): Promise<WhatsAppContactProfile> {
  return getJSON<WhatsAppContactProfile>(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/profile`,
  )
}

export async function saveWhatsAppContactProfile(
  profile: WhatsAppContactProfile,
): Promise<WhatsAppContactProfile> {
  const res = await launcherFetch(
    `/api/whatsapp/chats/${encodeURIComponent(profile.chat_jid)}/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    },
  )
  if (!res.ok) {
    throw new Error(`profile save failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<WhatsAppContactProfile>
}

export async function getWhatsAppConversationInsight(
  jid: string,
): Promise<WhatsAppConversationInsight> {
  return getJSON<WhatsAppConversationInsight>(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/insights`,
  )
}

export async function getWhatsAppReport(input?: {
  from?: number
  to?: number
}): Promise<WhatsAppReport> {
  const params = new URLSearchParams()
  if (input?.from) params.set("from", String(input.from))
  if (input?.to) params.set("to", String(input.to))
  const suffix = params.toString() ? `?${params.toString()}` : ""
  return getJSON<WhatsAppReport>(`/api/whatsapp/reports${suffix}`)
}

export async function pauseWhatsAppChat(
  jid: string,
  paused: boolean,
): Promise<void> {
  const res = await launcherFetch(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/pause`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused }),
    },
  )
  if (!res.ok) {
    throw new Error(`pause failed: ${res.status} ${res.statusText}`)
  }
}

export async function sendWhatsAppManual(
  jid: string,
  content: string,
): Promise<void> {
  const res = await launcherFetch(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  )
  if (!res.ok) {
    let detail: string
    try {
      const body = (await res.json()) as { error?: string }
      detail = body.error ?? ""
    } catch {
      detail = res.statusText
    }
    throw new Error(`send failed: ${detail || res.statusText}`)
  }
}

export async function markWhatsAppChatRead(jid: string): Promise<void> {
  await launcherFetch(`/api/whatsapp/chats/${encodeURIComponent(jid)}/read`, {
    method: "POST",
  })
}

export async function markWhatsAppChatUnread(jid: string): Promise<void> {
  const res = await launcherFetch(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/unread`,
    { method: "POST" },
  )
  if (!res.ok) {
    throw new Error(`mark unread failed: ${res.status} ${res.statusText}`)
  }
}

// ─── internal notes (dashboard-only annotations) ──────────────────────────────

export interface WhatsAppInternalNote {
  id: number
  chat_jid: string
  content: string
  author: string
  ts: number
}

export async function listWhatsAppNotes(
  jid: string,
  limit = 100,
): Promise<WhatsAppInternalNote[]> {
  const data = await getJSON<{ notes: WhatsAppInternalNote[] }>(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/notes?limit=${limit}`,
  )
  return data.notes ?? []
}

export async function addWhatsAppNote(input: {
  jid: string
  content: string
  author: string
}): Promise<WhatsAppInternalNote> {
  const res = await launcherFetch(
    `/api/whatsapp/chats/${encodeURIComponent(input.jid)}/notes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.content, author: input.author }),
    },
  )
  if (!res.ok) {
    throw new Error(`add note failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<WhatsAppInternalNote>
}

export async function deleteWhatsAppNote(
  jid: string,
  id: number,
): Promise<void> {
  const res = await launcherFetch(
    `/api/whatsapp/chats/${encodeURIComponent(jid)}/notes/${id}`,
    { method: "DELETE" },
  )
  if (!res.ok && res.status !== 204) {
    throw new Error(`delete note failed: ${res.status} ${res.statusText}`)
  }
}

export type InboxConnectionStatus = "connecting" | "online" | "reconnecting" | "offline"

export interface OpenInboxStreamOptions {
  onEvent: (evt: InboxEvent) => void
  onError?: (err: Event) => void
  onStatus?: (status: InboxConnectionStatus) => void
}

// EventSource wrapper. The launcher's session cookie is sent because we set
// `withCredentials: true` — same-origin gives that for free, but the explicit
// option keeps things working if the dashboard ever moves to a sub-domain
// behind the same TLS.
//
// Two call shapes are supported for backwards compatibility:
//   openInboxStream(onEvent, onError?)
//   openInboxStream({ onEvent, onError?, onStatus? })
//
// The object form exposes connection state transitions ("connecting" →
// "online" → "reconnecting" → "offline") so the dashboard can show a global
// indicator without re-wiring the EventSource lifecycle in every consumer.
export function openInboxStream(
  arg1: OpenInboxStreamOptions | ((evt: InboxEvent) => void),
  arg2?: (err: Event) => void,
): () => void {
  const opts: OpenInboxStreamOptions =
    typeof arg1 === "function" ? { onEvent: arg1, onError: arg2 } : arg1

  const es = new EventSource("/api/whatsapp/events", { withCredentials: true })
  opts.onStatus?.("connecting")

  const handler = (e: MessageEvent) => {
    opts.onStatus?.("online")
    try {
      const data = JSON.parse(e.data) as InboxEvent
      opts.onEvent(data)
    } catch {
      // ignore malformed events
    }
  }
  es.addEventListener("message", handler)
  es.addEventListener("chat_update", handler)
  es.addEventListener("open", () => opts.onStatus?.("online"))
  es.addEventListener("error", (err) => {
    // readyState: 0 = CONNECTING (reconnect in flight), 2 = CLOSED.
    opts.onStatus?.(es.readyState === EventSource.CLOSED ? "offline" : "reconnecting")
    opts.onError?.(err)
  })
  return () => {
    es.close()
    opts.onStatus?.("offline")
  }
}
