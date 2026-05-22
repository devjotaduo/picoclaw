export interface DedupedTags {
  visible: string[]
  overflow: string[]
  total: number
}

export function dedupeTags(
  raw: readonly string[] | null | undefined,
  limit = 3,
): DedupedTags {
  if (!raw || raw.length === 0) {
    return { visible: [], overflow: [], total: 0 }
  }
  const seen = new Set<string>()
  const unique: string[] = []
  for (const tag of raw) {
    const trimmed = tag.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(trimmed)
  }
  if (unique.length <= limit) {
    return { visible: unique, overflow: [], total: unique.length }
  }
  return {
    visible: unique.slice(0, limit),
    overflow: unique.slice(limit),
    total: unique.length,
  }
}
