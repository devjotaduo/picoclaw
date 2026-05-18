import { createLocalStore } from "./local-store"

export interface QuickReply {
  id: string
  /** Slash-keyword to filter by (e.g. "ola", "preco"). */
  shortcut: string
  /** Human-readable title displayed in the picker. */
  title: string
  /** The body inserted in the composer. Supports the {{name}} placeholder. */
  body: string
}

const STORE_KEY = "picoclaw:wa:quick-replies:v1"

const DEFAULTS: readonly QuickReply[] = [
  {
    id: "default-greeting",
    shortcut: "ola",
    title: "Saudação",
    body: "Olá {{name}}! Sou da equipe da JotaDuo, como posso ajudar?",
  },
  {
    id: "default-thanks",
    shortcut: "obrigado",
    title: "Agradecimento",
    body: "Obrigado pelo contato, {{name}}! Estamos à disposição.",
  },
  {
    id: "default-handoff",
    shortcut: "atendente",
    title: "Transferência",
    body: "Vou transferir você para um especialista. Aguarde só um instante.",
  },
  {
    id: "default-wait",
    shortcut: "aguarde",
    title: "Aguardar",
    body: "Um momento, estou verificando essa informação para você.",
  },
] as const

const store = createLocalStore<QuickReply[]>(STORE_KEY, [...DEFAULTS])
export const quickRepliesStore = store

export function listQuickReplies(): QuickReply[] {
  const data = store.read()
  return data.length === 0 ? [...DEFAULTS] : data
}

export function searchQuickReplies(query: string): QuickReply[] {
  const q = query.trim().toLowerCase().replace(/^\//, "")
  const all = listQuickReplies()
  if (!q) return all
  return all.filter(
    (r) =>
      r.shortcut.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.body.toLowerCase().includes(q),
  )
}

export function renderQuickReply(reply: QuickReply, vars: { name?: string }) {
  return reply.body.replace(/\{\{\s*name\s*\}\}/gi, vars.name?.trim() || "")
}

export function upsertQuickReply(reply: QuickReply): void {
  const list = store.read()
  const idx = list.findIndex((r) => r.id === reply.id)
  if (idx === -1) list.push(reply)
  else list[idx] = reply
  store.write(list)
}
