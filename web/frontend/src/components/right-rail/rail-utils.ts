/**
 * Helpers compartilhados do right rail. Separados de rail-card.tsx para o
 * fast-refresh do Vite não reclamar de arquivo que exporta componente + função.
 */

export function formatRailTime(iso?: string): string {
  if (!iso) return ""
  const created = new Date(iso).getTime()
  if (Number.isNaN(created)) return ""
  const diffSec = Math.max(0, Math.floor((Date.now() - created) / 1000))
  if (diffSec < 60) return "agora"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

export function agentInitials(name?: string): string {
  const parts = (name ?? "")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return "·"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
