import type { WhatsAppChat, WhatsAppContactProfile } from "@/api/whatsapp"

export type ConversationFilter =
  | "all"
  | "unread"
  | "mine"
  | "paused"
  | "tag"

export type ConversationSort = "recent" | "priority"

export interface FilterContext {
  /** Profile cache keyed by JID — supplies tags, assigned_to, priority. */
  profilesByJid?: Record<string, WhatsAppContactProfile | undefined>
  /** Operator handle used by the "Minhas" filter (`assigned_to === me`). */
  me?: string | null
  /** Tag string when filter === "tag" (case-insensitive comparison). */
  tag?: string | null
}

const PRIORITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
}

export function applyFilter(
  chats: readonly WhatsAppChat[],
  filter: ConversationFilter,
  ctx: FilterContext = {},
): WhatsAppChat[] {
  switch (filter) {
    case "all":
      return [...chats]
    case "unread":
      return chats.filter((c) => c.unread_count > 0)
    case "paused":
      return chats.filter((c) => c.paused)
    case "mine": {
      const me = ctx.me?.trim().toLowerCase()
      return chats.filter((c) => {
        const profile = ctx.profilesByJid?.[c.jid]
        const assigned = profile?.assigned_to?.trim().toLowerCase()
        if (!assigned) return false
        return me ? assigned === me : true
      })
    }
    case "tag": {
      const tag = ctx.tag?.trim().toLowerCase()
      if (!tag) return [...chats]
      return chats.filter((c) => {
        const profile = ctx.profilesByJid?.[c.jid]
        return (profile?.tags ?? []).some(
          (t) => t.trim().toLowerCase() === tag,
        )
      })
    }
  }
}

export function applySort(
  chats: readonly WhatsAppChat[],
  sort: ConversationSort,
  ctx: FilterContext = {},
): WhatsAppChat[] {
  const list = [...chats]
  if (sort === "priority") {
    list.sort((a, b) => {
      const pa = PRIORITY_RANK[ctx.profilesByJid?.[a.jid]?.priority ?? "none"] ?? 0
      const pb = PRIORITY_RANK[ctx.profilesByJid?.[b.jid]?.priority ?? "none"] ?? 0
      if (pa !== pb) return pb - pa
      return b.last_message_ts - a.last_message_ts
    })
  } else {
    list.sort((a, b) => b.last_message_ts - a.last_message_ts)
  }
  return list
}

/** Distinct tags collected from every profile in the cache. */
export function collectTags(
  profilesByJid: Record<string, WhatsAppContactProfile | undefined>,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const profile of Object.values(profilesByJid)) {
    for (const tag of profile?.tags ?? []) {
      const key = tag.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(tag.trim())
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "pt-BR"))
}
