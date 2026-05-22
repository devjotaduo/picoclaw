import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import {
  AUTOSCROLL_THRESHOLD_PX,
  distanceFromBottom,
  isNearBottom,
} from "@/lib/whatsapp/scroll-math"

export interface UseAutoScrollOptions {
  /** Key whose change resets the buffered count (e.g., selected chat JID). */
  resetKey?: string | number | null
  /** Total messages currently rendered (used to detect new arrivals). */
  messageCount: number
  /** Distance from bottom that still counts as "stuck to bottom" (default 200). */
  threshold?: number
}

export interface UseAutoScrollResult {
  scrollRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  newMessagesCount: number
  scrollToBottom: (smooth?: boolean) => void
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void
}

export function useAutoScroll({
  resetKey,
  messageCount,
  threshold = AUTOSCROLL_THRESHOLD_PX,
}: UseAutoScrollOptions): UseAutoScrollResult {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isAtBottomRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  const lastCountRef = useRef(0)

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    setNewMessagesCount(0)
  }, [])

  // Snap to bottom whenever the resetKey (e.g., active chat) changes.
  useLayoutEffect(() => {
    lastCountRef.current = messageCount
    setNewMessagesCount(0)
    setIsAtBottom(true)
    isAtBottomRef.current = true
    // Defer one frame so the new chat's DOM is committed first.
    queueMicrotask(() => scrollToBottom(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // When new messages arrive: if already near bottom, follow; otherwise
  // buffer the count for the "↓ N novas mensagens" pill.
  useEffect(() => {
    const prev = lastCountRef.current
    const delta = messageCount - prev
    lastCountRef.current = messageCount
    if (delta <= 0) return
    if (isAtBottomRef.current) {
      scrollToBottom(true)
    } else {
      setNewMessagesCount((c) => c + delta)
    }
  }, [messageCount, scrollToBottom])

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const metrics = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }
      const near = isNearBottom(metrics, threshold)
      isAtBottomRef.current = near
      setIsAtBottom(near)
      if (near && distanceFromBottom(metrics) <= 4) {
        setNewMessagesCount(0)
      }
    },
    [threshold],
  )

  return {
    scrollRef,
    isAtBottom,
    newMessagesCount,
    scrollToBottom,
    handleScroll,
  }
}
