import { useEffect, useState } from "react"

const DEFAULT_WINDOW_MS = 5_000
const TICK_MS = 1_000

/**
 * Returns `true` while `typingAt` is within `windowMs` of "now". The hook
 * polls every TICK_MS so the indicator naturally clears even if the gateway
 * never emits a "stopped typing" event. Calling `Date.now()` happens inside
 * useEffect to satisfy React 19's purity rules.
 */
export function useTypingWindow(
  typingAt: number | undefined | null,
  windowMs = DEFAULT_WINDOW_MS,
): boolean {
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    if (!typingAt) {
      setIsTyping(false)
      return
    }
    const ms = typingAt < 1e10 ? typingAt * 1000 : typingAt

    const refresh = () => {
      setIsTyping(Date.now() - ms < windowMs)
    }
    refresh()
    const handle = window.setInterval(refresh, TICK_MS)
    return () => window.clearInterval(handle)
  }, [typingAt, windowMs])

  return isTyping
}
