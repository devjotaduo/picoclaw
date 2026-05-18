import { useEffect, useRef, useState } from "react"

import {
  type InboxConnectionStatus,
  type InboxEvent,
  openInboxStream,
} from "@/api/whatsapp"

const STALE_AFTER_MS = 60_000

export interface UseInboxConnectionResult {
  status: InboxConnectionStatus
  lastEventAt: number | null
}

export function useInboxConnection(
  onEvent: (evt: InboxEvent) => void,
): UseInboxConnectionResult {
  const [status, setStatus] = useState<InboxConnectionStatus>("connecting")
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const close = openInboxStream({
      onEvent: (evt) => {
        setLastEventAt(Date.now())
        onEventRef.current(evt)
      },
      onStatus: (next) => setStatus(next),
    })
    return close
  }, [])

  // Demote "online" to "reconnecting" if we haven't heard anything in
  // STALE_AFTER_MS. The backend pings every 25s, but EventSource ignores
  // comments — this watchdog catches half-open connections (NAT timeouts,
  // proxy idle drops) where readyState still claims OPEN.
  useEffect(() => {
    if (status !== "online" || lastEventAt == null) return
    const handle = window.setTimeout(() => {
      if (Date.now() - lastEventAt >= STALE_AFTER_MS) {
        setStatus("reconnecting")
      }
    }, STALE_AFTER_MS)
    return () => window.clearTimeout(handle)
  }, [status, lastEventAt])

  return { status, lastEventAt }
}
