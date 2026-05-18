import { useCallback, useEffect, useRef, useState } from "react"

const DEFAULT_TYPING_DEBOUNCE_MS = 800
const DEFAULT_IDLE_RESUME_MS = 5 * 60_000

export type AutoPauseReason = "manual" | "typing" | "idle-resume"

export interface UseAgentAutoPauseOptions {
  /** Whether the agent is currently paused on the server. */
  paused: boolean
  /** Called when the hook decides the server-side pause state must change. */
  onChange: (paused: boolean, reason: AutoPauseReason) => void
  /** Disable the whole feature (e.g., no chat selected). */
  enabled?: boolean
  /** ms of silent typing before we flip to paused (default 800). */
  typingDebounceMs?: number
  /** ms of inactivity before we auto-resume (default 5 min). */
  idleResumeMs?: number
}

export interface UseAgentAutoPauseResult {
  autoPaused: boolean
  notifyTyping: () => void
  resumeNow: () => void
}

/**
 * Implements the WhatsApp Web–style auto-pause behavior:
 * - the operator starts typing → agent gets paused after `typingDebounceMs`
 *   so it doesn't race the operator's reply
 * - after `idleResumeMs` of no typing, the agent resumes automatically
 * - calling `resumeNow()` (from the "Retomar" chip) flips back immediately
 *
 * The hook never mutates the server directly; it calls `onChange` so the
 * caller stays in charge of the API mutation, optimistic updates, etc.
 */
export function useAgentAutoPause({
  paused,
  onChange,
  enabled = true,
  typingDebounceMs = DEFAULT_TYPING_DEBOUNCE_MS,
  idleResumeMs = DEFAULT_IDLE_RESUME_MS,
}: UseAgentAutoPauseOptions): UseAgentAutoPauseResult {
  const [autoPaused, setAutoPaused] = useState(false)
  const debounceRef = useRef<number | null>(null)
  const idleRef = useRef<number | null>(null)

  // Mirror prop/state into refs from effects, so timer callbacks read fresh
  // values without retriggering all the useCallback deps each render.
  const pausedRef = useRef(paused)
  const autoPausedRef = useRef(autoPaused)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  useEffect(() => {
    autoPausedRef.current = autoPaused
  }, [autoPaused])
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const clearTimers = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (idleRef.current != null) {
      window.clearTimeout(idleRef.current)
      idleRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  // If the chat itself gets unpaused externally (operator clicked the toggle,
  // or another tab paused), clear our auto-pause flag — the source of truth
  // is the server state.
  useEffect(() => {
    if (!paused) setAutoPaused(false)
  }, [paused])

  const notifyTyping = useCallback(() => {
    if (!enabled) return
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    if (idleRef.current != null) window.clearTimeout(idleRef.current)

    debounceRef.current = window.setTimeout(() => {
      if (!pausedRef.current) {
        setAutoPaused(true)
        onChangeRef.current(true, "typing")
      }
    }, typingDebounceMs)

    idleRef.current = window.setTimeout(() => {
      // Only auto-resume if WE paused it (autoPaused flag), so a manual pause
      // by the operator stays sticky until they resume manually.
      if (pausedRef.current && autoPausedRef.current) {
        setAutoPaused(false)
        onChangeRef.current(false, "idle-resume")
      }
    }, idleResumeMs)
  }, [enabled, idleResumeMs, typingDebounceMs])

  const resumeNow = useCallback(() => {
    clearTimers()
    setAutoPaused(false)
    if (pausedRef.current) onChangeRef.current(false, "manual")
  }, [clearTimers])

  return { autoPaused, notifyTyping, resumeNow }
}
