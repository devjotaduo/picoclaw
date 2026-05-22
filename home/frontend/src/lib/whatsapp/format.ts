export function formatJID(jid: string): string {
  const [user] = jid.split("@")
  if (!user) return jid
  return /^\d+$/.test(user) ? `+${user}` : user
}

export function toDate(ts: number): Date {
  return new Date(ts < 1e10 ? ts * 1000 : ts)
}

export function formatRelativeTS(ts: number): string {
  if (!ts) return ""
  const d = toDate(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) {
    const h = d.getHours().toString().padStart(2, "0")
    const m = d.getMinutes().toString().padStart(2, "0")
    return `${h}:${m}`
  }
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" })
  const dd = d.getDate().toString().padStart(2, "0")
  const mm = (d.getMonth() + 1).toString().padStart(2, "0")
  return `${dd}/${mm}`
}
