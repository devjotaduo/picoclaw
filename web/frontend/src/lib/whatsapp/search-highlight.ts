export interface HighlightRange {
  start: number
  end: number
}

/**
 * Case-insensitive, accent-INSENSITIVE substring search. Returns the
 * non-overlapping match ranges in the order they appear.
 */
export function findMatches(text: string, query: string): HighlightRange[] {
  const q = normalize(query)
  if (!q) return []
  const haystack = normalize(text)
  const ranges: HighlightRange[] = []
  let from = 0
  while (from <= haystack.length - q.length) {
    const idx = haystack.indexOf(q, from)
    if (idx === -1) break
    ranges.push({ start: idx, end: idx + q.length })
    from = idx + q.length
  }
  return ranges
}

export function hasMatch(text: string, query: string): boolean {
  if (!query.trim()) return false
  return normalize(text).includes(normalize(query))
}

/** Split a string into [plain, match, plain, match, …] segments. */
export interface Segment {
  text: string
  match: boolean
}

export function splitByMatches(text: string, query: string): Segment[] {
  const ranges = findMatches(text, query)
  if (ranges.length === 0) return [{ text, match: false }]
  const segments: Segment[] = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start > cursor) {
      segments.push({ text: text.slice(cursor, r.start), match: false })
    }
    segments.push({ text: text.slice(r.start, r.end), match: true })
    cursor = r.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false })
  }
  return segments
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}
