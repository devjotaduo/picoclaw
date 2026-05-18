/**
 * Tiny localStorage adapter — used by features that must persist across
 * page reloads but have no backend home yet (internal notes, quick replies,
 * keyboard preferences). The adapter is sync, JSON-typed, and resilient to
 * SSR / private-mode failures (returns `defaultValue` and never throws).
 */
export interface LocalStore<T> {
  read(): T
  write(value: T): void
  subscribe(listener: () => void): () => void
}

const subscribers = new Map<string, Set<() => void>>()

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key) return
    const set = subscribers.get(e.key)
    if (set) set.forEach((fn) => fn())
  })
}

function notify(key: string) {
  const set = subscribers.get(key)
  if (set) set.forEach((fn) => fn())
}

export function createLocalStore<T>(
  key: string,
  defaultValue: T,
): LocalStore<T> {
  return {
    read(): T {
      if (typeof window === "undefined") return defaultValue
      try {
        const raw = window.localStorage.getItem(key)
        if (raw == null) return defaultValue
        return JSON.parse(raw) as T
      } catch {
        return defaultValue
      }
    },
    write(value: T): void {
      if (typeof window === "undefined") return
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
        notify(key)
      } catch {
        /* swallow quota errors */
      }
    },
    subscribe(listener: () => void): () => void {
      let set = subscribers.get(key)
      if (!set) {
        set = new Set()
        subscribers.set(key, set)
      }
      set.add(listener)
      return () => {
        set!.delete(listener)
      }
    },
  }
}
