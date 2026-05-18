import type { TemplateApplyPayload } from "@/components/agent/templates/types"

export interface AgentVersion {
  id: string
  agentID: string
  createdAt: number
  label: string
  payload: TemplateApplyPayload
}

const STORAGE_KEY = "picoclaw:agent-editor:versions"
const MAX_PER_AGENT = 20

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null
    return window.localStorage
  } catch {
    return null
  }
}

export function loadVersions(agentID: string): AgentVersion[] {
  const storage = safeStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Record<string, AgentVersion[]>
    return parsed[agentID] ?? []
  } catch {
    return []
  }
}

export function appendVersion(
  agentID: string,
  payload: TemplateApplyPayload,
  label: string,
): AgentVersion {
  const storage = safeStorage()
  const now = Date.now()
  const version: AgentVersion = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    agentID,
    createdAt: now,
    label,
    payload: JSON.parse(JSON.stringify(payload)) as TemplateApplyPayload,
  }
  if (!storage) return version
  try {
    const raw = storage.getItem(STORAGE_KEY)
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, AgentVersion[]>)
      : {}
    const list = [version, ...(parsed[agentID] ?? [])].slice(0, MAX_PER_AGENT)
    parsed[agentID] = list
    storage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore quota errors
  }
  return version
}

export function deleteVersion(agentID: string, versionID: string): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, AgentVersion[]>
    parsed[agentID] = (parsed[agentID] ?? []).filter((v) => v.id !== versionID)
    storage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

export interface DiffLine {
  kind: "context" | "add" | "remove"
  value: string
}

export function diffPayload(
  a: TemplateApplyPayload | null,
  b: TemplateApplyPayload | null,
  contextLines = 2,
): DiffLine[] {
  const left = formatPayload(a)
  const right = formatPayload(b)
  return diffStrings(left, right, contextLines)
}

export function formatPayload(payload: TemplateApplyPayload | null): string {
  if (!payload) return ""
  return JSON.stringify(payload, null, 2)
}

function diffStrings(
  left: string,
  right: string,
  contextLines: number,
): DiffLine[] {
  const a = left.split("\n")
  const b = right.split("\n")
  const lcs = longestCommonSubsequence(a, b)
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  let k = 0
  while (i < a.length || j < b.length) {
    if (k < lcs.length && a[i] === lcs[k] && b[j] === lcs[k]) {
      result.push({ kind: "context", value: a[i]! })
      i++
      j++
      k++
    } else if (j < b.length && (k >= lcs.length || b[j] !== lcs[k])) {
      result.push({ kind: "add", value: b[j]! })
      j++
    } else if (i < a.length && (k >= lcs.length || a[i] !== lcs[k])) {
      result.push({ kind: "remove", value: a[i]! })
      i++
    }
  }
  return compactContext(result, contextLines)
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }
  const out: string[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.unshift(a[i - 1]!)
      i--
      j--
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--
    } else {
      j--
    }
  }
  return out
}

function compactContext(
  lines: DiffLine[],
  contextLines: number,
): DiffLine[] {
  if (contextLines <= 0) return lines.filter((l) => l.kind !== "context")
  const out: DiffLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.kind !== "context") {
      out.push(line)
      continue
    }
    const isNearChange = lines
      .slice(Math.max(0, i - contextLines), i + contextLines + 1)
      .some((l) => l.kind !== "context")
    if (isNearChange) out.push(line)
  }
  return out
}
