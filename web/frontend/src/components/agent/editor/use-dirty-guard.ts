import { useEffect } from "react"

export function useDirtyGuard(isDirty: boolean, message?: string) {
  useEffect(() => {
    if (!isDirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = message ?? ""
      return message ?? ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty, message])
}

export function useSaveShortcut(handler: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac")
      const cmdKey = isMac ? e.metaKey : e.ctrlKey
      if (cmdKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handler])
}
