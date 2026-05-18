import { useEffect } from "react"

export interface GlobalShortcutHandlers {
  onPrevConversation?: () => void
  onNextConversation?: () => void
  onOpenCurrent?: () => void
  onEscape?: () => void
  onOpenCommandPalette?: () => void
  onFocusComposer?: () => void
}

/**
 * Global keyboard shortcuts for the inbox:
 *   ↑ / ↓     — navigate the conversation list
 *   Enter     — open the focused conversation (when not typing in a field)
 *   Esc       — close any modal/sheet/search (caller decides which)
 *   Ctrl+K    — open the command palette
 *   /         — focus the composer (caller chooses)
 *
 * Shortcuts that would conflict with typing in inputs/textareas are no-ops
 * while the focus is inside an editable element.
 */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)

      // Ctrl/⌘+K always wins (it works even while typing).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        handlers.onOpenCommandPalette?.()
        return
      }

      // Escape always fires (caller layers Sheet/Dialog escapes themselves).
      if (e.key === "Escape" && handlers.onEscape) {
        handlers.onEscape()
        return
      }

      if (inEditable) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        handlers.onNextConversation?.()
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        handlers.onPrevConversation?.()
      } else if (e.key === "Enter") {
        e.preventDefault()
        handlers.onOpenCurrent?.()
      } else if (e.key === "/") {
        e.preventDefault()
        handlers.onFocusComposer?.()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handlers])
}
