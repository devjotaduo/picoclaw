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
}

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

async function getJSON<T>(path: string): Promise<T> {
  const res = await launcherFetch(path)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
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

// EventSource wrapper. The launcher's session cookie is sent because we set
// `withCredentials: true` — same-origin gives that for free, but the explicit
// option keeps things working if the dashboard ever moves to a sub-domain
// behind the same TLS.
export function openInboxStream(
  onEvent: (evt: InboxEvent) => void,
  onError?: (err: Event) => void,
): () => void {
  const es = new EventSource("/api/whatsapp/events", { withCredentials: true })
  const handler = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as InboxEvent
      onEvent(data)
    } catch {
      // ignore malformed events
    }
  }
  es.addEventListener("message", handler)
  es.addEventListener("chat_update", handler)
  if (onError) {
    es.addEventListener("error", onError)
  }
  return () => es.close()
}
