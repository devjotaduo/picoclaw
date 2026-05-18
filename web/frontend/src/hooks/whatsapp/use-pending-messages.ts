import { useCallback, useEffect, useRef, useState } from "react"

const DEFAULT_PROMOTE_AFTER_MS = 30_000

/**
 * Tracks message IDs (or temporary client keys) that were just sent and are
 * still waiting for the server to confirm. The MessageBubble renders them as
 * "pending" (clock icon). Entries auto-expire after `promoteAfterMs` so a
 * stuck-pending bubble can never wedge the UI.
 */
export function usePendingMessages(promoteAfterMs = DEFAULT_PROMOTE_AFTER_MS) {
  const [pending, setPending] = useState<ReadonlySet<number | string>>(
    () => new Set(),
  )
  const timersRef = useRef<Map<number | string, number>>(new Map())

  const remove = useCallback((id: number | string) => {
    setPending((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    const timer = timersRef.current.get(id)
    if (timer != null) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const add = useCallback(
    (id: number | string) => {
      setPending((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
      const timer = window.setTimeout(() => remove(id), promoteAfterMs)
      timersRef.current.set(id, timer)
    },
    [promoteAfterMs, remove],
  )

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [])

  return { pending, add, remove }
}
