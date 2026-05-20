import { useCallback, useEffect, useState } from "react"

import { type AgentEditorTab, TABS_ORDER, isValidTab } from "./tabs-nav"

const PARAM = "tab"

export function readInitialTab(
  fallback: AgentEditorTab = "identity",
): AgentEditorTab {
  if (typeof window === "undefined") return fallback
  const params = new URLSearchParams(window.location.search)
  const raw = params.get(PARAM)
  return raw && isValidTab(raw) ? raw : fallback
}

export function useTabSync(
  initial: AgentEditorTab = "identity",
): [AgentEditorTab, (next: AgentEditorTab) => void] {
  const [tab, setTab] = useState<AgentEditorTab>(() => readInitialTab(initial))

  useEffect(() => {
    function onPopState() {
      setTab(readInitialTab(initial))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [initial])

  const navigate = useCallback((next: AgentEditorTab) => {
    if (!isValidTab(next)) return
    setTab(next)
    const url = new URL(window.location.href)
    if (next === TABS_ORDER[0]) {
      url.searchParams.delete(PARAM)
    } else {
      url.searchParams.set(PARAM, next)
    }
    window.history.replaceState({}, "", url.toString())
  }, [])

  return [tab, navigate]
}
