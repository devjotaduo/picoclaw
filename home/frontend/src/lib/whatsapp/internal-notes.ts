import { createLocalStore } from "./local-store"

export interface InternalNote {
  id: string
  chat_jid: string
  content: string
  author: string
  ts: number
}

const STORE_KEY = "picoclaw:wa:internal-notes:v1"
const store = createLocalStore<InternalNote[]>(STORE_KEY, [])

export const internalNotesStore = store

export function listNotes(chatJID: string): InternalNote[] {
  return store
    .read()
    .filter((n) => n.chat_jid === chatJID)
    .sort((a, b) => b.ts - a.ts)
}

export function addNote(input: {
  chatJID: string
  content: string
  author: string
}): InternalNote {
  const note: InternalNote = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chat_jid: input.chatJID,
    content: input.content.trim(),
    author: input.author,
    ts: Date.now(),
  }
  store.write([note, ...store.read()])
  return note
}

export function removeNote(id: string): void {
  store.write(store.read().filter((n) => n.id !== id))
}
