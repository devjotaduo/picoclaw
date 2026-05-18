import { useCallback, useMemo, useState } from "react"

import type { WhatsAppMessage } from "@/api/whatsapp"
import { hasMatch } from "@/lib/whatsapp/search-highlight"

export interface UseConversationSearchOptions {
  messages: WhatsAppMessage[]
}

export interface UseConversationSearchResult {
  query: string
  setQuery: (q: string) => void
  /** All message indexes (in `messages`) that match the current query. */
  matchIndexes: number[]
  /** Current 0-based cursor into `matchIndexes`. */
  cursor: number
  next: () => void
  prev: () => void
  reset: () => void
  hasMatches: boolean
  /** Convenience: the WhatsApp message id at the current cursor (or null). */
  currentMessageId: number | null
}

export function useConversationSearch({
  messages,
}: UseConversationSearchOptions): UseConversationSearchResult {
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)

  const matchIndexes = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    const idxs: number[] = []
    for (let i = 0; i < messages.length; i++) {
      if (hasMatch(messages[i]!.content, q)) idxs.push(i)
    }
    return idxs
  }, [messages, query])

  // Whenever the matches change, snap the cursor to the LAST match (newest in
  // a bottom-anchored chat) so the operator sees the most recent occurrence.
  const lastIdx = matchIndexes.length === 0 ? 0 : matchIndexes.length - 1
  const safeCursor = Math.min(cursor, lastIdx)

  const next = useCallback(() => {
    setCursor((c) => {
      if (matchIndexes.length === 0) return 0
      return (c + 1) % matchIndexes.length
    })
  }, [matchIndexes.length])

  const prev = useCallback(() => {
    setCursor((c) => {
      if (matchIndexes.length === 0) return 0
      return (c - 1 + matchIndexes.length) % matchIndexes.length
    })
  }, [matchIndexes.length])

  const reset = useCallback(() => {
    setQuery("")
    setCursor(0)
  }, [])

  const setQueryAndReset = useCallback((q: string) => {
    setQuery(q)
    setCursor(0)
  }, [])

  const currentMessageId =
    matchIndexes.length > 0
      ? (messages[matchIndexes[safeCursor]!]?.id ?? null)
      : null

  return {
    query,
    setQuery: setQueryAndReset,
    matchIndexes,
    cursor: safeCursor,
    next,
    prev,
    reset,
    hasMatches: matchIndexes.length > 0,
    currentMessageId,
  }
}
